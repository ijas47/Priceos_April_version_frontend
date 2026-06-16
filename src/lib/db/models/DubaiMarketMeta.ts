import mongoose, { Document, Schema, Model } from "mongoose";

/** Tracks Dubai open-market dataset ingest freshness. */
export interface IDubaiMarketMeta extends Document {
  source: "airroi_dubai_kaggle";
  sourceVersion: string;
  listingCount: number;
  monthlyRowCount: number;
  monthFrom: string;
  monthTo: string;
  ingestedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DubaiMarketMetaSchema = new Schema<IDubaiMarketMeta>(
  {
    source: { type: String, default: "airroi_dubai_kaggle" },
    sourceVersion: { type: String, required: true },
    listingCount: { type: Number, required: true },
    monthlyRowCount: { type: Number, required: true },
    monthFrom: { type: String, required: true },
    monthTo: { type: String, required: true },
    ingestedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export const DubaiMarketMeta: Model<IDubaiMarketMeta> =
  mongoose.models.DubaiMarketMeta ??
  mongoose.model<IDubaiMarketMeta>("DubaiMarketMeta", DubaiMarketMetaSchema);