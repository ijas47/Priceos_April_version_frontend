import { createHostawayClient, isHostawayReadOnly } from "../hostaway/client";
import { connectDB, InventoryMaster, Listing, Insight } from "@/lib/db";
import { format, parseISO } from "date-fns";
import mongoose from "mongoose";
import type { HostawayCalendarUpdate } from "../hostaway/types";
import { verifyCalendarPush } from "@/lib/pms/calendar-sync-verify";

export interface ExecutionResult {
    success: boolean;
    proposalId: string;
    updatedDays: number;
    verified: boolean;
    expectedPrice?: number;
    actualPrice?: number | null;
    mismatchAed?: number | null;
    error?: string;
    executedAt: Date;
}

/**
 * Channel Sync Agent
 * Responsible for executing approved price proposals to HostAway
 */
export class ChannelSyncAgent {
    private hostawayApiKey: string;

    constructor(hostawayApiKey: string) {
        this.hostawayApiKey = hostawayApiKey;
    }

    /**
     * Execute a single approved proposal
     */
    async executeProposal(proposalId: string): Promise<ExecutionResult> {
        const executedAt = new Date();

        try {
            await connectDB();

            const proposal = await InventoryMaster.findById(
                new mongoose.Types.ObjectId(proposalId)
            ).lean();

            if (!proposal) {
                throw new Error(`Inventory day ${proposalId} not found`);
            }

            const listing = await Listing.findById(proposal.listingId)
                .select("hostawayId name")
                .lean();

            const dateStr = proposal.date;
            const dates = [parseISO(dateStr)];
            const priceToPush = Number(proposal.proposedPrice ?? proposal.currentPrice);

            let verified = false;
            let actualPrice: number | null = null;
            let mismatchAed: number | null = null;
            let verifyAttempts = 0;

            if (listing?.hostawayId && !isHostawayReadOnly()) {
                const hostawayId = parseInt(listing.hostawayId, 10);

                const updates: HostawayCalendarUpdate[] = dates.map((date) => ({
                    date: format(date, "yyyy-MM-dd"),
                    price: priceToPush,
                }));

                const client = createHostawayClient(this.hostawayApiKey);
                await client.updateCalendar(hostawayId, updates);

                const verification = await verifyCalendarPush(
                    client,
                    hostawayId,
                    dateStr,
                    priceToPush
                );
                verified = verification.verified;
                actualPrice = verification.actualPrice;
                mismatchAed = verification.mismatchAed;
                verifyAttempts = verification.attempts;

                await InventoryMaster.findByIdAndUpdate(proposalId, {
                    $set: {
                        syncVerified: verified,
                        syncVerifiedAt: verification.verifiedAt,
                        syncExpectedPrice: priceToPush,
                        syncActualPrice: actualPrice ?? undefined,
                        syncMismatchAed: mismatchAed ?? undefined,
                        syncVerifyAttempts: verifyAttempts,
                        lastSyncedAt: executedAt,
                        proposalStatus: verified ? "pushed" : "approved",
                    },
                });

                if (!verified) {
                    await this.createSyncMismatchInsight({
                        orgId: proposal.orgId,
                        listingId: proposal.listingId,
                        listingName: listing?.name,
                        date: dateStr,
                        expectedPrice: priceToPush,
                        actualPrice,
                        mismatchAed,
                    });
                }
            } else {
                verified = true;
                await InventoryMaster.findByIdAndUpdate(proposalId, {
                    $set: {
                        syncVerified: true,
                        syncVerifiedAt: executedAt,
                        syncExpectedPrice: priceToPush,
                        syncActualPrice: priceToPush,
                        syncMismatchAed: 0,
                        lastSyncedAt: executedAt,
                        proposalStatus: "pushed",
                    },
                });
            }

            return {
                success: verified,
                proposalId,
                updatedDays: dates.length,
                verified,
                expectedPrice: priceToPush,
                actualPrice,
                mismatchAed,
                error: verified
                    ? undefined
                    : `Hostaway read-back mismatch: expected ${priceToPush}, got ${actualPrice ?? "unknown"}`,
                executedAt,
            };
        } catch (error) {
            console.error(`Execution failed for proposal ${proposalId}:`, error);
            return {
                success: false,
                proposalId,
                updatedDays: 0,
                verified: false,
                error: (error as Error).message,
                executedAt,
            };
        }
    }

    /**
     * Execute multiple proposals in batch
     */
    async executeBatch(proposalIds: string[]): Promise<ExecutionResult[]> {
        const results: ExecutionResult[] = [];
        for (const proposalId of proposalIds) {
            const result = await this.executeProposal(proposalId);
            results.push(result);
            if (results.length < proposalIds.length) {
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }
        return results;
    }

    private async createSyncMismatchInsight(params: {
        orgId: mongoose.Types.ObjectId;
        listingId: mongoose.Types.ObjectId;
        listingName?: string;
        date: string;
        expectedPrice: number;
        actualPrice: number | null;
        mismatchAed: number | null;
    }): Promise<void> {
        const label = params.listingName ?? "Listing";
        const actual =
            params.actualPrice != null
                ? `${params.actualPrice} AED`
                : "unreadable";

        await Insight.create({
            orgId: params.orgId,
            listingId: params.listingId,
            category: "PMS_SYNC",
            severity: "high",
            status: "pending",
            title: `Hostaway sync mismatch - ${label}`,
            summary: `${params.date}: pushed ${params.expectedPrice} AED but Hostaway shows ${actual}${params.mismatchAed != null ? ` (Δ ${params.mismatchAed} AED)` : ""}. Review calendar manually.`,
            confidence: 95,
            detectorKey: "sync_mismatch",
            signalData: {
                date: params.date,
                expectedPrice: params.expectedPrice,
                actualPrice: params.actualPrice,
                mismatchAed: params.mismatchAed,
            },
            action: { type: "advisory", scope: params.date },
        });
    }
}

export function createChannelSyncAgent(hostawayApiKey: string): ChannelSyncAgent {
    return new ChannelSyncAgent(hostawayApiKey);
}