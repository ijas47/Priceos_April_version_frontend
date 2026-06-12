import mongoose, { Document, Schema, Model } from "mongoose";

export interface IEngineRun extends Document {
  orgId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  startedAt: Date;
  status: "SUCCESS" | "FAILED" | "RUNNING";
  errorMessage?: string;
  daysChanged?: number;
  durationMs?: number;
  batchId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EngineRunSchema = new Schema<IEngineRun>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    startedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED", "RUNNING"],
      default: "RUNNING",
    },
    errorMessage: String,
    daysChanged: Number,
    durationMs: Number,
    batchId: String,
  },
  { timestamps: true }
);

export const EngineRun: Model<IEngineRun> =
  mongoose.models.EngineRun ??
  mongoose.model<IEngineRun>("EngineRun", EngineRunSchema);
