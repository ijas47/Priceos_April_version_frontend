import mongoose, { Document, Schema, Model } from "mongoose";

export interface IInventoryMaster extends Document {
  orgId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  date: string; // "YYYY-MM-DD"
  currentPrice: number;
  basePrice?: number;
  status: "available" | "booked" | "blocked" | "pending";
  minStay?: number;
  maxStay?: number;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  // Staged change (HITL)
  proposedPrice?: number;
  proposalStatus?: "pending" | "approved" | "rejected" | "pushed";
  changePct?: number;
  reasoning?: string;
  batchId?: string;
  // Sync
  hostawayStatus?: string;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InventorySchema = new Schema<IInventoryMaster>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    date: { type: String, required: true },
    currentPrice: { type: Number, required: true },
    basePrice: { type: Number },
    status: {
      type: String,
      enum: ["available", "booked", "blocked", "pending"],
      default: "available",
    },
    minStay: { type: Number },
    maxStay: { type: Number },
    closedToArrival: { type: Boolean, default: false },
    closedToDeparture: { type: Boolean, default: false },
    proposedPrice: { type: Number },
    proposalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "pushed"],
    },
    changePct: { type: Number },
    reasoning: { type: String },
    batchId: { type: String },
    hostawayStatus: { type: String },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

// Unique per listing + date
InventorySchema.index({ listingId: 1, date: 1 }, { unique: true });
InventorySchema.index({ orgId: 1, proposalStatus: 1 });

export const InventoryMaster: Model<IInventoryMaster> =
  mongoose.models.InventoryMaster ??
  mongoose.model<IInventoryMaster>("InventoryMaster", InventorySchema);
