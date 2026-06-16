import mongoose, { Document, Schema, Model } from "mongoose";

/**
 * Pre-aggregated monthly market stats from Dubai AirROI dataset.
 * Scoped by areaKey (city-wide or named sub-market) and bedroom count.
 */
export interface IDubaiMarketMonthly extends Document {
  areaKey: string;
  bedrooms: number;
  /** YYYY-MM */
  month: string;
  listingCount: number;
  p25Adr: number;
  p50Adr: number;
  p75Adr: number;
  avgOccupancy: number;
  source: "airroi_dubai_kaggle";
  sourceVersion: string;
  ingestedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DubaiMarketMonthlySchema = new Schema<IDubaiMarketMonthly>(
  {
    areaKey: { type: String, required: true, index: true },
    bedrooms: { type: Number, required: true, index: true },
    month: { type: String, required: true, index: true },
    listingCount: { type: Number, required: true },
    p25Adr: { type: Number, required: true },
    p50Adr: { type: Number, required: true },
    p75Adr: { type: Number, required: true },
    avgOccupancy: { type: Number, required: true },
    source: { type: String, default: "airroi_dubai_kaggle" },
    sourceVersion: { type: String, required: true },
    ingestedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

DubaiMarketMonthlySchema.index(
  { areaKey: 1, bedrooms: 1, month: 1 },
  { unique: true }
);

export const DubaiMarketMonthly: Model<IDubaiMarketMonthly> =
  mongoose.models.DubaiMarketMonthly ??
  mongoose.model<IDubaiMarketMonthly>(
    "DubaiMarketMonthly",
    DubaiMarketMonthlySchema
  );