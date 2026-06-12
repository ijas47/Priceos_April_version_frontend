import mongoose, { Document, Schema, Model } from "mongoose";

export interface ISeasonalPattern {
  month: number;
  demandScore: number;
  ratePremiumPct: number;
  notes?: string;
}

export interface IGuardrailDefaults {
  maxSingleDayChangePct: number;
  autoApproveThreshold: number;
  absoluteFloorMultiplier: number;
  absoluteCeilingMultiplier: number;
}

export interface IMarketTemplate extends Document {
  marketCode: string;
  displayName: string;
  country: string;
  currency: string;
  timezone: string;
  weekendDefinition: "thu_fri" | "fri_sat" | "sat_sun";
  flag: string;
  guardrailDefaults: IGuardrailDefaults;
  seasonalPatterns: ISeasonalPattern[];
  eventApiConfig: {
    ticketmasterCity?: string;
    eventbriteCity?: string;
    customKeywords?: string[];
  };
  regulatoryFlags: {
    hasNightCap: boolean;
    nightCapPerYear?: number;
    requiresLicence: boolean;
    licenceFieldLabel?: string;
  } | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MarketTemplateSchema = new Schema<IMarketTemplate>(
  {
    marketCode: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    country: { type: String, required: true },
    currency: { type: String, required: true },
    timezone: { type: String, required: true },
    weekendDefinition: {
      type: String,
      enum: ["thu_fri", "fri_sat", "sat_sun"],
      required: true,
    },
    flag: { type: String, required: true },
    guardrailDefaults: {
      maxSingleDayChangePct: { type: Number, default: 15 },
      autoApproveThreshold: { type: Number, default: 5 },
      absoluteFloorMultiplier: { type: Number, default: 0.5 },
      absoluteCeilingMultiplier: { type: Number, default: 3.0 },
    },
    seasonalPatterns: [
      {
        month: { type: Number, required: true },
        demandScore: { type: Number, required: true },
        ratePremiumPct: { type: Number, required: true },
        notes: { type: String },
      },
    ],
    eventApiConfig: {
      ticketmasterCity: { type: String },
      eventbriteCity: { type: String },
      customKeywords: [{ type: String }],
    },
    regulatoryFlags: {
      type: {
        hasNightCap: { type: Boolean, default: false },
        nightCapPerYear: { type: Number },
        requiresLicence: { type: Boolean, default: false },
        licenceFieldLabel: { type: String },
      },
      default: null,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const MarketTemplate: Model<IMarketTemplate> =
  mongoose.models.MarketTemplate ??
  mongoose.model<IMarketTemplate>("MarketTemplate", MarketTemplateSchema);
