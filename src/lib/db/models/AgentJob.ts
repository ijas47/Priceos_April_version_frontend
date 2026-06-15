import mongoose, { Schema, type Document, type Model } from "mongoose";

export type JobStatus = "running" | "complete" | "error";

export interface IAgentJob extends Document {
  status: JobStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const AgentJobSchema = new Schema<IAgentJob>(
  {
    status: {
      type: String,
      enum: ["running", "complete", "error"],
      default: "running",
      required: true,
    },
    result: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

AgentJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

export const AgentJob: Model<IAgentJob> =
  mongoose.models.AgentJob || mongoose.model<IAgentJob>("AgentJob", AgentJobSchema);