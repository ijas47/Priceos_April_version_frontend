import mongoose, { Document, Schema, Model } from "mongoose";

export interface IOrganization extends Document {
  name: string;
  email: string;
  passwordHash: string;
  refreshToken?: string;
  role: "owner" | "admin" | "viewer";
  isApproved: boolean;
  fullName?: string;
  hostawayApiKey?: string;
  hostawayAccountId?: string;
  marketCode: string;
  currency: string;
  timezone: string;
  plan: "starter" | "growth" | "scale";
  settings: {
    guardrails: {
      maxSingleDayChangePct: number;
      autoApproveThreshold: number;
      absoluteFloorMultiplier: number;
      absoluteCeilingMultiplier: number;
    };
    automation: {
      autoPushApproved: boolean;
      dailyPipelineRun: boolean;
    };
    overrides: {
      currency?: string;
      timezone?: string;
      weekendDefinition?: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrgSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    refreshToken: { type: String },
    role: { type: String, enum: ["owner", "admin", "viewer"], default: "owner" },
    isApproved: { type: Boolean, default: true },
    fullName: { type: String },
    hostawayApiKey: { type: String },
    hostawayAccountId: { type: String },
    marketCode: { type: String, default: "UAE_DXB" },
    currency: { type: String, default: "AED" },
    timezone: { type: String, default: "Asia/Dubai" },
    plan: { type: String, enum: ["starter", "growth", "scale"], default: "starter" },
    settings: {
      guardrails: {
        maxSingleDayChangePct: { type: Number, default: 15 },
        autoApproveThreshold: { type: Number, default: 5 },
        absoluteFloorMultiplier: { type: Number, default: 0.5 },
        absoluteCeilingMultiplier: { type: Number, default: 3.0 },
      },
      automation: {
        autoPushApproved: { type: Boolean, default: false },
        dailyPipelineRun: { type: Boolean, default: true },
      },
      overrides: {
        currency: { type: String },
        timezone: { type: String },
        weekendDefinition: { type: String },
      },
    },
  },
  { timestamps: true }
);

export const Organization: Model<IOrganization> =
  mongoose.models.Organization ??
  mongoose.model<IOrganization>("Organization", OrgSchema);
