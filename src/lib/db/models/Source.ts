import mongoose, { Document, Schema, Model } from "mongoose";

export interface ISource extends Document {
  sourceId: string; // "hostaway" | "competitors" | "events" | "seasonality"
  name: string;
  description: string;
  iconName: string;
  schedule: string;       // cron or human label
  scheduleLabel: string;  // e.g. "Every 4 hours"
  isEnabled: boolean;
  lastRunAt?: Date;
  lastRunStatus?: "success" | "error" | "running" | "idle";
  lastRunDurationMs?: number;
  lastRunMetric?: string; // e.g. "47 listings synced"
  nextRunAt?: Date;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const SourceSchema = new Schema<ISource>(
  {
    sourceId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    iconName: { type: String, default: "Database" },
    schedule: { type: String, default: "0 */4 * * *" },
    scheduleLabel: { type: String, default: "Every 4 hours" },
    isEnabled: { type: Boolean, default: true },
    lastRunAt: Date,
    lastRunStatus: {
      type: String,
      enum: ["success", "error", "running", "idle"],
      default: "idle",
    },
    lastRunDurationMs: Number,
    lastRunMetric: String,
    nextRunAt: Date,
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Source: Model<ISource> =
  mongoose.models.Source ?? mongoose.model<ISource>("Source", SourceSchema);
