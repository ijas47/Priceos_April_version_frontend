import { NextRequest, NextResponse } from "next/server";
import { connectDB, InventoryMaster } from "@/lib/db";
import { ChannelSyncAgent } from "@/lib/agents/channel-sync-agent";
import mongoose from "mongoose";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await connectDB();

        // Verify proposal exists
        const proposal = await InventoryMaster.findById(
            new mongoose.Types.ObjectId(id)
        ).lean();

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

        // Execute via Channel Sync Agent
        const channelSyncAgent = new ChannelSyncAgent(
            process.env.HOSTAWAY_API_KEY || ""
        );

        const result = await channelSyncAgent.executeProposal(id);

        if (result.success) {
            return NextResponse.json({
                success: true,
                message: `Price updated from AED ${Number(proposal.currentPrice).toLocaleString("en-US")} to AED ${proposedPrice.toLocaleString("en-US")} for ${proposal.date}. Updated ${result.updatedDays} days${result.verified ? " (verified)" : ""}.`,
            });
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
