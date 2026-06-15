import mongoose from "mongoose";
import { connectDB, ContentProposal, Listing, ListingContentSnapshot } from "@/lib/db";
import { createHostawayClient } from "@/lib/hostaway/client";
import type { HostawayListingUpdate } from "@/lib/hostaway/types";
import { resolveHostawayApiKey } from "./hostaway-key";
import { syncListingContentFromHostaway } from "./snapshot";

export interface ContentExecutionResult {
  success: boolean;
  proposalId: string;
  verified: boolean;
  error?: string;
}

function fieldToHostawayUpdate(
  channel: string,
  field: string,
  value: string
): HostawayListingUpdate {
  if (channel === "airbnb" && field === "title") return { airbnbName: value };
  if (channel === "airbnb" && field === "summary") return { airbnbSummary: value };
  if (channel === "booking_com" && field === "title") return { externalListingName: value };
  if (channel === "booking_com" && field === "description") return { description: value };
  if (channel === "vrbo" && field === "headline") return { homeawayPropertyHeadline: value };
  return {};
}

export class ContentSyncAgent {
  constructor(private hostawayApiKey: string) {}

  async executeProposal(proposalId: string): Promise<ContentExecutionResult> {
    try {
      await connectDB();
      const proposal = await ContentProposal.findById(
        new mongoose.Types.ObjectId(proposalId)
      ).lean();
      if (!proposal) throw new Error("Content proposal not found");

      const listing = await Listing.findById(proposal.listingId)
        .select("hostawayId orgId")
        .lean();
      if (!listing?.hostawayId) throw new Error("Listing not linked to Hostaway");

      const update = fieldToHostawayUpdate(
        proposal.channel,
        proposal.field,
        proposal.proposedValue
      );
      if (Object.keys(update).length === 0) {
        throw new Error(`Unsupported channel/field: ${proposal.channel}/${proposal.field}`);
      }

      const client = createHostawayClient(this.hostawayApiKey);
      const hostawayId = parseInt(listing.hostawayId, 10);

      await client.updateListing(hostawayId, update);

      await ContentProposal.findByIdAndUpdate(proposalId, {
        $set: { status: "pushed", pushedAt: new Date(), error: undefined },
      });

      await syncListingContentFromHostaway({
        orgId: proposal.orgId as mongoose.Types.ObjectId,
        listingId: proposal.listingId as mongoose.Types.ObjectId,
      });

      const refreshed = await ListingContentSnapshot.findOne({
        orgId: proposal.orgId,
        listingId: proposal.listingId,
      }).lean();

      let verified = false;
      if (refreshed) {
        const live = readLiveValue(refreshed, proposal.channel, proposal.field);
        verified = live.trim() === proposal.proposedValue.trim();
      }

      await ContentProposal.findByIdAndUpdate(proposalId, {
        $set: {
          status: verified ? "verified" : "pushed",
          verifiedAt: verified ? new Date() : undefined,
        },
      });

      return { success: true, proposalId, verified };
    } catch (err) {
      const message = (err as Error).message;
      await ContentProposal.findByIdAndUpdate(proposalId, {
        $set: { status: "failed", error: message },
      }).catch(() => {});
      return { success: false, proposalId, verified: false, error: message };
    }
  }

  async rollback(proposalId: string): Promise<ContentExecutionResult> {
    try {
      await connectDB();
      const proposal = await ContentProposal.findById(proposalId).lean();
      if (!proposal?.rollbackPayload) throw new Error("No rollback payload");

      const listing = await Listing.findById(proposal.listingId).select("hostawayId").lean();
      if (!listing?.hostawayId) throw new Error("Listing not linked to Hostaway");

      const client = createHostawayClient(this.hostawayApiKey);
      await client.updateListing(
        parseInt(listing.hostawayId, 10),
        proposal.rollbackPayload as HostawayListingUpdate
      );

      return { success: true, proposalId, verified: true };
    } catch (err) {
      return {
        success: false,
        proposalId,
        verified: false,
        error: (err as Error).message,
      };
    }
  }
}

function readLiveValue(
  snap: { channels: Record<string, Record<string, string | undefined>> },
  channel: string,
  field: string
): string {
  const c = snap.channels[channel];
  if (!c) return "";
  if (field === "title") return c.title || "";
  if (field === "summary") return c.summary || "";
  if (field === "description") return c.description || "";
  if (field === "headline") return c.headline || "";
  return "";
}

export async function createContentSyncAgentForOrg(
  orgId: mongoose.Types.ObjectId | string
): Promise<ContentSyncAgent | null> {
  const key = await resolveHostawayApiKey(orgId);
  if (!key) return null;
  return new ContentSyncAgent(key);
}