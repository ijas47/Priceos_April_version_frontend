import { NextRequest, NextResponse } from "next/server";
import { connectDB, InventoryMaster } from "@/lib/db";
import { ChannelSyncAgent } from "@/lib/agents/channel-sync-agent";
import { getSession } from "@/lib/auth/server";
import { resolveHostawayApiKey } from "@/lib/listing-content/hostaway-key";
import { getHostawayApiKey } from "@/lib/env";
import mongoose from "mongoose";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid proposal ID" }, { status: 400 });
        }

        await connectDB();

        // Verify proposal exists AND belongs to the caller's org (tenant isolation)
        const proposal = await InventoryMaster.findOne({
            _id: new mongoose.Types.ObjectId(id),
            orgId: session.orgId,
        }).lean();

        if (!proposal) {
            return NextResponse.json(
                { success: false, message: "Proposal matching inventory record not found" },
                { status: 404 }
            );
        }

        if (!proposal.proposedPrice) {
            return NextResponse.json(
                { success: false, message: "No proposed price pending for this date" },
                { status: 400 }
            );
        }

        const proposedPrice = Number(proposal.proposedPrice);

        // Update: apply proposed price, clear proposal
        await InventoryMaster.findByIdAndUpdate(new mongoose.Types.ObjectId(id), {
            $set: {
                currentPrice: proposedPrice,
                proposedPrice: null,
                proposalStatus: "approved",
            },
        });

        const apiKey =
            (await resolveHostawayApiKey(session.orgId)) ||
            getHostawayApiKey() ||
            "";
        const channelSyncAgent = new ChannelSyncAgent(apiKey);
        const result = await channelSyncAgent.executeProposal(id);

        if (result.success && result.verified) {
            return NextResponse.json({
                success: true,
                message: `Price updated from AED ${Number(proposal.currentPrice).toLocaleString("en-US")} to AED ${proposedPrice.toLocaleString("en-US")} for ${proposal.date}. Verified on Hostaway (${result.actualPrice ?? proposedPrice} AED).`,
            });
        } else if (result.success && !result.verified) {
            return NextResponse.json({
                success: false,
                message: `Price pushed but Hostaway verification failed for ${proposal.date}. Expected ${proposedPrice} AED, read back ${result.actualPrice ?? "unknown"} AED. A sync alert was created.`,
            }, { status: 502 });
        } else {
            // Revert on failure
            await InventoryMaster.findByIdAndUpdate(new mongoose.Types.ObjectId(id), {
                $set: {
                    currentPrice: Number(proposal.currentPrice),
                    proposedPrice: proposedPrice,
                    proposalStatus: "pending",
                },
            });

            return NextResponse.json(
                {
                    success: false,
                    message: result.error || "Failed to execute proposal",
                },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error("Error approving proposal:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
