import mongoose, { Document, Schema, Model } from "mongoose";

export interface IPilotAccessCode extends Document {
  code: string;
  label?: string;
  plan: "starter" | "growth" | "scale";
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  expiresAt?: Date;
  createdByOrgId?: mongoose.Types.ObjectId;
  redeemedBy: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const PilotAccessCodeSchema = new Schema<IPilotAccessCode>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    label: { type: String },
    plan: { type: String, enum: ["starter", "growth", "scale"], default: "starter" },
    maxUses: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date },
    createdByOrgId: { type: Schema.Types.ObjectId, ref: "Organization" },
    redeemedBy: [{ type: Schema.Types.ObjectId, ref: "Organization" }],
  },
  { timestamps: true }
);

PilotAccessCodeSchema.index({ isActive: 1, expiresAt: 1 });

export const PilotAccessCode: Model<IPilotAccessCode> =
  mongoose.models.PilotAccessCode ??
  mongoose.model<IPilotAccessCode>("PilotAccessCode", PilotAccessCodeSchema);