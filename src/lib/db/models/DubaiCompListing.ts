import mongoose, { Document, Schema, Model } from "mongoose";

/** Static comp listing from AirROI Dubai open dataset (Kaggle). */
export interface IDubaiCompListing extends Document {
  listingId: string;
  listingType?: string;
  roomType?: string;
  propertyType?: string;
  neighborhood?: string;
  latitude: number;
  longitude: number;
  bedrooms: number;
  beds?: number;
  baths?: number;
  guests?: number;
  currency: string;
  /** Trailing 12-month ADR (AED) derived at ingest. */
  ttmAvgRate?: number;
  /** Trailing 12-month occupancy 0..1. */
  ttmOccupancy?: number;
  /** Last 90-day ADR (AED). */
  l90dAvgRate?: number;
  /** Last 90-day occupancy 0..1. */
  l90dOccupancy?: number;
  /** Most recent month in source data (YYYY-MM-DD). */
  lastMonthDate?: string;
  source: "airroi_dubai_kaggle";
  sourceVersion: string;
  ingestedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DubaiCompListingSchema = new Schema<IDubaiCompListing>(
  {
    listingId: { type: String, required: true, unique: true, index: true },
    listingType: String,
    roomType: String,
    propertyType: String,
    neighborhood: String,
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    bedrooms: { type: Number, required: true, index: true },
    beds: Number,
    baths: Number,
    guests: Number,
    currency: { type: String, default: "AED" },
    ttmAvgRate: Number,
    ttmOccupancy: Number,
    l90dAvgRate: Number,
    l90dOccupancy: Number,
    lastMonthDate: String,
    source: { type: String, default: "airroi_dubai_kaggle" },
    sourceVersion: { type: String, required: true },
    ingestedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

DubaiCompListingSchema.index({ latitude: 1, longitude: 1, bedrooms: 1 });
DubaiCompListingSchema.index({ neighborhood: 1, bedrooms: 1 });

export const DubaiCompListing: Model<IDubaiCompListing> =
  mongoose.models.DubaiCompListing ??
  mongoose.model<IDubaiCompListing>("DubaiCompListing", DubaiCompListingSchema);