import mongoose, { Document, Schema, Model } from "mongoose";

export interface IListing extends Document {
  orgId: mongoose.Types.ObjectId;
  hostawayId?: string;
  name: string;
  city: string;
  countryCode: string;
  area: string;
  bedroomsNumber: number;
  bathroomsNumber: number;
  propertyTypeId: number;
  price: number;
  /** Trusted base when PMS price is validated (may differ from listing.price). */
  validatedBasePrice?: number;
  basePriceSource?: "history_1y" | "benchmark" | "hostaway";
  basePriceConfidencePct?: number;
  basePriceSampleSize?: number;
  pmsPriceTrusted?: boolean;
  basePriceValidatedAt?: Date;
  /** ready | advisory | blocked — set by pricing data-quality gate */
  pricingDataStatus?: "ready" | "advisory" | "blocked";
  pricingDataSummary?: string;
  pricingDataIssues?: string[];
  pricingDataCheckedAt?: Date;
  currencyCode: string;
  personCapacity?: number;
  amenities?: string[];
  address?: string;
  priceFloor: number;
  floorReasoning?: string;
  priceCeiling: number;
  ceilingReasoning?: string;
  guardrailsSource: "manual" | "ai" | "market_template";
  // Last Minute
  lastMinuteEnabled: boolean;
  lastMinuteDaysOut: number;
  lastMinuteDiscountPct: number;
  lastMinuteMinStay?: number;
  lastMinuteRampEnabled: boolean;
  lastMinuteRampDays: number;
  lastMinuteMaxDiscountPct: number;
  lastMinuteMinDiscountPct: number;
  // Occupancy-based pricing (PriceLabs matrix)
  occupancyEnabled: boolean;
  occupancyLookbackDays: number;
  occupancyMatrix?: {
    dayRanges: { startDay: number; endDay: number; label?: string }[];
    rows: { maxOccupancyPct: number; adjustmentsPct: number[] }[];
  };
  occupancyPreset?: string;
  usePortfolioPricingDefaults: boolean;
  pricingProfileOverrideId?: string;
  seasonalCalendarOverrideId?: string;
  minStayProfileOverrideId?: string;
  // Far Out
  farOutEnabled: boolean;
  farOutDaysOut: number;
  farOutMarkupPct: number;
  farOutMinStay?: number;
  // DOW pricing
  dowPricingEnabled: boolean;
  dowDays: number[];
  dowPriceAdjPct: number;
  dowMinStay?: number;
  // Gap prevention
  gapPreventionEnabled: boolean;
  minFragmentThreshold: number;
  // Gap fill
  gapFillEnabled: boolean;
  gapFillLengthMin: number;
  gapFillLengthMax: number;
  gapFillDiscountPct: number;
  gapFillOverrideCico: boolean;
  // Check-in/out restrictions
  allowedCheckinDays: number[];
  allowedCheckoutDays: number[];
  lowestMinStayAllowed: number;
  defaultMaxStay: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ListingSchema = new Schema<IListing>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", index: true },
    hostawayId: { type: String, unique: true, sparse: true },
    name: { type: String, required: true },
    city: { type: String, default: "" },
    countryCode: { type: String, default: "" },
    area: { type: String, default: "" },
    bedroomsNumber: { type: Number, default: 1 },
    bathroomsNumber: { type: Number, default: 1 },
    propertyTypeId: { type: Number, default: 0 },
    price: { type: Number, required: true },
    validatedBasePrice: { type: Number },
    basePriceSource: {
      type: String,
      enum: ["history_1y", "benchmark", "hostaway"],
      default: "hostaway",
    },
    basePriceConfidencePct: { type: Number, default: 0 },
    basePriceSampleSize: { type: Number, default: 0 },
    pmsPriceTrusted: { type: Boolean, default: true },
    basePriceValidatedAt: { type: Date },
    pricingDataStatus: {
      type: String,
      enum: ["ready", "advisory", "blocked"],
    },
    pricingDataSummary: { type: String },
    pricingDataIssues: [{ type: String }],
    pricingDataCheckedAt: { type: Date },
    currencyCode: { type: String, default: "AED" },
    personCapacity: { type: Number },
    amenities: [{ type: String }],
    address: { type: String },
    priceFloor: { type: Number, default: 0 },
    floorReasoning: { type: String },
    priceCeiling: { type: Number, default: 0 },
    ceilingReasoning: { type: String },
    guardrailsSource: {
      type: String,
      enum: ["manual", "ai", "market_template"],
      default: "manual",
    },
    lastMinuteEnabled: { type: Boolean, default: false },
    lastMinuteDaysOut: { type: Number, default: 7 },
    lastMinuteDiscountPct: { type: Number, default: 15 },
    lastMinuteMinStay: { type: Number },
    lastMinuteRampEnabled: { type: Boolean, default: false },
    lastMinuteRampDays: { type: Number, default: 60 },
    lastMinuteMaxDiscountPct: { type: Number, default: 30 },
    lastMinuteMinDiscountPct: { type: Number, default: 0 },
    occupancyEnabled: { type: Boolean, default: false },
    occupancyLookbackDays: { type: Number, default: 30 },
    occupancyMatrix: { type: Schema.Types.Mixed },
    occupancyPreset: { type: String },
    usePortfolioPricingDefaults: { type: Boolean, default: true },
    pricingProfileOverrideId: { type: String },
    seasonalCalendarOverrideId: { type: String },
    minStayProfileOverrideId: { type: String },
    farOutEnabled: { type: Boolean, default: false },
    farOutDaysOut: { type: Number, default: 90 },
    farOutMarkupPct: { type: Number, default: 10 },
    farOutMinStay: { type: Number },
    dowPricingEnabled: { type: Boolean, default: false },
    dowDays: { type: [Number], default: [4, 5] }, // Thu+Fri (0=Mon)
    dowPriceAdjPct: { type: Number, default: 20 },
    dowMinStay: { type: Number },
    gapPreventionEnabled: { type: Boolean, default: true },
    minFragmentThreshold: { type: Number, default: 3 },
    gapFillEnabled: { type: Boolean, default: false },
    gapFillLengthMin: { type: Number, default: 1 },
    gapFillLengthMax: { type: Number, default: 3 },
    gapFillDiscountPct: { type: Number, default: 10 },
    gapFillOverrideCico: { type: Boolean, default: true },
    allowedCheckinDays: { type: [Number], default: [1, 1, 1, 1, 1, 1, 1] },
    allowedCheckoutDays: { type: [Number], default: [1, 1, 1, 1, 1, 1, 1] },
    lowestMinStayAllowed: { type: Number, default: 1 },
    defaultMaxStay: { type: Number, default: 365 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Listing: Model<IListing> =
  mongoose.models.Listing ?? mongoose.model<IListing>("Listing", ListingSchema);
