import mongoose, { Document, Schema, Model } from "mongoose";

export type InsightCategory =
  | "BOOKING_PACE"
  | "LEAD_TIME"
  | "CANCELLATION_RISK"
  | "OCCUPANCY"
  | "GAP_FILL"
  | "LOS_OPTIMIZATION"
  | "COMPETITOR_RATE"
  | "DAY_OF_WEEK"
  | "REVIEW_SCORE"
  | "EVENT_IMPACT"
  | "SEASONAL_SHIFT"
  | "CHANNEL_MIX";

export type InsightStatus =
  | "pending"
  | "approved"
  | "modified"
  | "rejected"
  | "snoozed"
  | "superseded";

export interface IInsightAction {
  type: "price_increase" | "price_decrease" | "gap_fill" | "min_stay_change" | "block" | "advisory";
  adjustPct?: number;
  absolutePrice?: number;
  dateRange?: { start: string; end: string };
  scope?: string;
  data?: Record<string, unknown>;
}

export interface IInsight extends Document {
  orgId: mongoose.Types.ObjectId;
  listingId?: mongoose.Types.ObjectId;
  category: InsightCategory;
  severity: "high" | "medium" | "low";
  status: InsightStatus;
  title: string;
  summary: string;
  confidence: number;
  action?: IInsightAction;
  modifiedAction?: IInsightAction;
  resolvedBy?: string;
  resolvedAt?: Date;
  snoozeUntil?: Date;
  pushedAt?: Date;
  detectorKey?: string;
  signalData?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const InsightSchema = new Schema<IInsight>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", sparse: true },
    category: {
      type: String,
      enum: [
        "BOOKING_PACE", "LEAD_TIME", "CANCELLATION_RISK", "OCCUPANCY",
        "GAP_FILL", "LOS_OPTIMIZATION", "COMPETITOR_RATE", "DAY_OF_WEEK",
        "REVIEW_SCORE", "EVENT_IMPACT", "SEASONAL_SHIFT", "CHANNEL_MIX",
      ],
      required: true,
    },
    severity: { type: String, enum: ["high", "medium", "low"], default: "medium" },
    status: {
      type: String,
      enum: ["pending", "approved", "modified", "rejected", "snoozed", "superseded"],
      default: "pending",
      index: true,
    },
    title: { type: String, required: true },
    summary: { type: String },
    confidence: { type: Number, default: 0.7 },
    action: { type: Schema.Types.Mixed },
    modifiedAction: { type: Schema.Types.Mixed },
    resolvedBy: { type: String },
    resolvedAt: { type: Date },
    snoozeUntil: { type: Date },
    pushedAt: { type: Date },
    detectorKey: { type: String },
    signalData: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

InsightSchema.index({ orgId: 1, status: 1, createdAt: -1 });

export const Insight: Model<IInsight> =
  mongoose.models.Insight ?? mongoose.model<IInsight>("Insight", InsightSchema);
