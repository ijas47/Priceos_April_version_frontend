import mongoose, { Document, Schema, Model } from "mongoose";

export interface IContentProposal extends Document {
  orgId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  channel: "airbnb" | "booking_com" | "vrbo" | "all";
  field: "title" | "summary" | "description" | "headline";
  currentValue: string;
  proposedValue: string;
  reasoning: string;
  visibilityScore?: number;
  visibilityDelta?: number;
  expectedImpact: "high" | "medium" | "low";
  risk: "low" | "medium" | "high";
  status: "pending" | "approved" | "rejected" | "pushed" | "verified" | "failed";
  batchId?: string;
  rollbackPayload?: Record<string, unknown>;
  pushedAt?: Date;
  verifiedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContentProposalSchema = new Schema<IContentProposal>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    channel: {
      type: String,
      enum: ["airbnb", "booking_com", "vrbo", "all"],
      required: true,
    },
    field: {
      type: String,
      enum: ["title", "summary", "description", "headline"],
      required: true,
    },
    currentValue: { type: String, default: "" },
    proposedValue: { type: String, required: true },
    reasoning: { type: String, default: "" },
    visibilityScore: { type: Number },
    visibilityDelta: { type: Number },
    expectedImpact: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
    risk: { type: String, enum: ["low", "medium", "high"], default: "low" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "pushed", "verified", "failed"],
      default: "pending",
      index: true,
    },
    batchId: { type: String, index: true },
    rollbackPayload: { type: Schema.Types.Mixed },
    pushedAt: { type: Date },
    verifiedAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true }
);

ContentProposalSchema.index({ orgId: 1, listingId: 1, status: 1 });

export const ContentProposal: Model<IContentProposal> =
  mongoose.models.ContentProposal ??
  mongoose.model<IContentProposal>("ContentProposal", ContentProposalSchema);