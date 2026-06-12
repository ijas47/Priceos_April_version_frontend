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
