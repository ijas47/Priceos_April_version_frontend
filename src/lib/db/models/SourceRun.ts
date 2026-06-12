import mongoose, { Document, Schema, Model } from "mongoose";

export interface ISourceRun extends Document {
  orgId: mongoose.Types.ObjectId;
  sourceId: string;
  status: "running" | "success" | "error";
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  recordsProcessed?: number;
  signalsGenerated?: number;
  error?: string;
  logs: string[];
  triggeredBy: "manual" | "schedule" | "system";
  createdAt: Date;
  updatedAt: Date;
}

const SourceRunSchema = new Schema<ISourceRun>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    sourceId: { type: String, required: true },
    status: {
      type: String,
      enum: ["running", "success", "error"],
      default: "running",
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    durationMs: Number,
    recordsProcessed: Number,
    signalsGenerated: Number,
    error: String,
    logs: [{ type: String }],
    triggeredBy: {
      type: String,
      enum: ["manual", "schedule", "system"],
      default: "manual",
    },
  },
  { timestamps: true }
);

SourceRunSchema.index({ orgId: 1, startedAt: -1 });
SourceRunSchema.index({ orgId: 1, sourceId: 1 });

export const SourceRun: Model<ISourceRun> =
  mongoose.models.SourceRun ??
  mongoose.model<ISourceRun>("SourceRun", SourceRunSchema);
