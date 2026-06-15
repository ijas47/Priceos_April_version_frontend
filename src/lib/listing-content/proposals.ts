import mongoose from "mongoose";
import { connectDB, ContentProposal, ListingContentSnapshot } from "@/lib/db";
import type { OptimizerResult } from "./types";
import { estimateProposalDelta } from "./optimizer";

export async function persistContentProposals(opts: {
  orgId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  result: OptimizerResult;
  batchId: string;
}): Promise<number> {
  const { orgId, listingId, result, batchId } = opts;
  await connectDB();

  const snapshot = await ListingContentSnapshot.findOne({ orgId, listingId }).lean();
  if (!snapshot) throw new Error("Snapshot missing");

  await ContentProposal.deleteMany({ orgId, listingId, status: "pending" });

  const docs = result.proposals.map((p) => {
    const delta =
      snapshot && p.channel !== "all"
        ? estimateProposalDelta(p.channel, p.field, snapshot, p.proposed)
        : p.visibilityDelta;

    return {
      orgId,
      listingId,
      channel: p.channel,
      field: p.field,
      currentValue: p.current,
      proposedValue: p.proposed,
      reasoning: p.reasoning,
      visibilityScore: result.audit.overall,
      visibilityDelta: delta,
      expectedImpact: delta >= 10 ? "high" : delta >= 5 ? "medium" : "low",
      risk: p.risk,
      status: "pending" as const,
      batchId,
      rollbackPayload: buildRollbackField(p.channel, p.field, p.current),
    };
  });

  if (docs.length === 0) return 0;
  await ContentProposal.insertMany(docs);
  return docs.length;
}

function buildRollbackField(
  channel: string,
  field: string,
  current: string
): Record<string, unknown> {
  if (channel === "airbnb" && field === "title") return { airbnbName: current };
  if (channel === "airbnb" && field === "summary") return { airbnbSummary: current };
  if (channel === "booking_com" && field === "title") return { externalListingName: current };
  if (channel === "booking_com" && field === "description") return { description: current };
  if (channel === "vrbo" && field === "headline") return { homeawayPropertyHeadline: current };
  return {};
}