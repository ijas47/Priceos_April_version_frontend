import mongoose, { Document, Schema, Model } from "mongoose";

export interface IGuestSummary extends Document {
  orgId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  dateFrom: string;
  dateTo: string;
  sentiment: "Positive" | "Neutral" | "Needs Attention";
  themes: string[];
  actionItems: string[];
  bulletPoints: string[];
  totalConversations: number;
  needsReplyCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const GuestSummarySchema = new Schema<IGuestSummary>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    dateFrom: { type: String, required: true },
    dateTo: { type: String, required: true },
    sentiment: {
      type: String,
      enum: ["Positive", "Neutral", "Needs Attention"],
      default: "Neutral",
    },
    themes: [{ type: String }],
    actionItems: [{ type: String }],
    bulletPoints: [{ type: String }],
    totalConversations: { type: Number, default: 0 },
    needsReplyCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

GuestSummarySchema.index({ listingId: 1, dateFrom: 1, dateTo: 1 });

export const GuestSummary: Model<IGuestSummary> =
  mongoose.models.GuestSummary ??
  mongoose.model<IGuestSummary>("GuestSummary", GuestSummarySchema);
