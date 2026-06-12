import mongoose, { Document, Schema, Model } from "mongoose";

export interface IMarketEvent extends Document {
  orgId: mongoose.Types.ObjectId;
  listingId?: mongoose.Types.ObjectId; // null = portfolio-wide
  name: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  area?: string;
  areas?: string[];
  impactLevel: "high" | "medium" | "low";
  upliftPct: number;
  description?: string;
  source: "ai_detected" | "ticketmaster" | "eventbrite" | "manual" | "market_template";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MarketEventSchema = new Schema<IMarketEvent>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", sparse: true },
    name: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    area: { type: String },
    areas: [{ type: String }],
    impactLevel: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
    upliftPct: { type: Number, default: 0 },
    description: { type: String },
    source: {
      type: String,
      enum: ["ai_detected", "ticketmaster", "eventbrite", "manual", "market_template"],
      default: "ai_detected",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MarketEventSchema.index({ orgId: 1, startDate: 1, endDate: 1 });

export const MarketEvent: Model<IMarketEvent> =
  mongoose.models.MarketEvent ??
  mongoose.model<IMarketEvent>("MarketEvent", MarketEventSchema);
