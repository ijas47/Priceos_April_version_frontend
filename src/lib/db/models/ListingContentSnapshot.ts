import mongoose, { Document, Schema, Model } from "mongoose";

export interface IListingContentSnapshot extends Document {
  orgId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  hostawayId: string;
  channels: {
    airbnb: { title?: string; summary?: string; listingUrl?: string };
    booking_com: { title?: string; description?: string; listingUrl?: string };
    vrbo: { headline?: string; description?: string; listingUrl?: string };
  };
  shared: {
    description: string;
    amenities: string[];
    personCapacity?: number;
    bedroomsNumber?: number;
    averageReviewRating?: number;
  };
  visibilityScore: number;
  channelScores?: Record<string, number>;
  hostawayRaw?: Record<string, unknown>;
  capturedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChannelBlock = {
  title: { type: String },
  summary: { type: String },
  description: { type: String },
  headline: { type: String },
  listingUrl: { type: String },
};

const ListingContentSnapshotSchema = new Schema<IListingContentSnapshot>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    hostawayId: { type: String, required: true },
    channels: {
      airbnb: ChannelBlock,
      booking_com: ChannelBlock,
      vrbo: ChannelBlock,
    },
    shared: {
      description: { type: String, default: "" },
      amenities: [{ type: String }],
      personCapacity: { type: Number },
      bedroomsNumber: { type: Number },
      averageReviewRating: { type: Number },
    },
    visibilityScore: { type: Number, default: 0 },
    channelScores: { type: Schema.Types.Mixed },
    hostawayRaw: { type: Schema.Types.Mixed },
    capturedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ListingContentSnapshotSchema.index({ orgId: 1, listingId: 1 }, { unique: true });

export const ListingContentSnapshot: Model<IListingContentSnapshot> =
  mongoose.models.ListingContentSnapshot ??
  mongoose.model<IListingContentSnapshot>(
    "ListingContentSnapshot",
    ListingContentSnapshotSchema
  );