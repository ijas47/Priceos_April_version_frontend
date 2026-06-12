import mongoose, { Document, Schema, Model } from "mongoose";

export interface IComp {
  name: string;
  source: string;
  sourceUrl?: string;
  rating?: number;
  reviews?: number;
  avgRate: number;
  weekdayRate?: number;
  weekendRate?: number;
  minRate?: number;
  maxRate?: number;
}

export interface IBenchmarkData extends Document {
  orgId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  dateFrom: string;
  dateTo: string;
  p25Rate?: number;
  p50Rate?: number;
  p75Rate?: number;
  p90Rate?: number;
  avgWeekday?: number;
  avgWeekend?: number;
  yourPrice?: number;
  percentile?: number;
  verdict?: "UNDERPRICED" | "FAIR" | "SLIGHTLY_ABOVE" | "OVERPRICED";
  rateTrend?: "rising" | "stable" | "falling";
  trendPct?: number;
  recommendedWeekday?: number;
  recommendedWeekend?: number;
  recommendedEvent?: number;
  reasoning?: string;
  comps: IComp[];
  createdAt: Date;
  updatedAt: Date;
}

const BenchmarkSchema = new Schema<IBenchmarkData>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    dateFrom: { type: String, required: true },
    dateTo: { type: String, required: true },
    p25Rate: Number,
    p50Rate: Number,
    p75Rate: Number,
    p90Rate: Number,
    avgWeekday: Number,
    avgWeekend: Number,
    yourPrice: Number,
    percentile: Number,
    verdict: {
      type: String,
      enum: ["UNDERPRICED", "FAIR", "SLIGHTLY_ABOVE", "OVERPRICED"],
    },
    rateTrend: { type: String, enum: ["rising", "stable", "falling"] },
    trendPct: Number,
    recommendedWeekday: Number,
    recommendedWeekend: Number,
    recommendedEvent: Number,
    reasoning: String,
    comps: [
      {
        name: String,
        source: String,
        sourceUrl: String,
        rating: Number,
        reviews: Number,
        avgRate: Number,
        weekdayRate: Number,
        weekendRate: Number,
        minRate: Number,
        maxRate: Number,
      },
    ],
  },
  { timestamps: true }
);

BenchmarkSchema.index(
  { listingId: 1, dateFrom: 1, dateTo: 1 },
  { unique: true }
);

export const BenchmarkData: Model<IBenchmarkData> =
  mongoose.models.BenchmarkData ??
  mongoose.model<IBenchmarkData>("BenchmarkData", BenchmarkSchema);
