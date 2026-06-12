import { createHostawayClient, isHostawayReadOnly } from "../hostaway/client";
import { connectDB, InventoryMaster, Listing } from "@/lib/db";
import { format, parseISO } from "date-fns";
import mongoose from "mongoose";
import type { HostawayCalendarUpdate } from "../hostaway/types";

export interface ExecutionResult {
    success: boolean;
    proposalId: string;
    updatedDays: number;
    verified: boolean;
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

            // Fetch proposal (inventoryMaster record)
            const proposal = await InventoryMaster.findById(
                new mongoose.Types.ObjectId(proposalId)
            ).lean();

            if (!proposal) {
                throw new Error(`Inventory day ${proposalId} not found`);
            }

            // Get listing's hostawayId
            const listing = await Listing.findById(proposal.listingId)
                .select("hostawayId")
                .lean();

            // Single date update
            const dateStr = proposal.date;
            const dates = [parseISO(dateStr)];

            // The price to execute: the staged proposedPrice if still present,
            // else currentPrice (the approve route moves proposedPrice into
            // currentPrice before calling us). This makes execution correct
            // regardless of caller ordering.
            const priceToPush = Number(proposal.proposedPrice ?? proposal.currentPrice);

            let verified = false;

            // If hostawayId exists, push to HostAway API
            // (skipped in read-only mode — execution is DB-only)
            if (listing?.hostawayId && !isHostawayReadOnly()) {
                const hostawayId = parseInt(listing.hostawayId);

                const updates: HostawayCalendarUpdate[] = dates.map((date) => ({
                    date: format(date, "yyyy-MM-dd"),
                    price: priceToPush,
                }));

                const client = createHostawayClient(this.hostawayApiKey);
                await client.updateCalendar(hostawayId, updates);

                verified = await this.verifyExecution(
                    hostawayId,
                    format(dates[0], "yyyy-MM-dd"),
                    format(dates[dates.length - 1], "yyyy-MM-dd"),
                    priceToPush
                );
            } else {
                // No hostawayId - database-only mode
                verified = true;
            }

            return {
                success: true,
                proposalId,
                updatedDays: dates.length,
                verified,
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

    private async verifyExecution(
        hostawayId: number,
        startDate: string,
        endDate: string,
        expectedPrice: number
    ): Promise<boolean> {
        try {
            const client = createHostawayClient(this.hostawayApiKey);
            const calendar = await client.getCalendar(hostawayId, startDate, endDate);
            return calendar.every((day) => Math.abs(day.price - expectedPrice) < 0.01);
        } catch (error) {
            console.error("Verification failed:", error);
            return false;
        }
    }
}

export function createChannelSyncAgent(hostawayApiKey: string): ChannelSyncAgent {
    return new ChannelSyncAgent(hostawayApiKey);
}
