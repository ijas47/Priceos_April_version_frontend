import mongoose, { Document, Schema, Model } from "mongoose";
import type { RuleType } from "./PricingRule";

export interface IGroupPricingRule extends Document {
  orgId: mongoose.Types.ObjectId;
  groupId: mongoose.Types.ObjectId;
  ruleType: RuleType;
  ruleCategory?: string;
  name: string;
  enabled: boolean;
  priority: number;
  startDate?: string;
  endDate?: string;
  daysOfWeek?: number[];
  minNights?: number;
  priceOverride?: number;
  priceAdjPct?: number;
  minPriceOverride?: number;
  maxPriceOverride?: number;
  minStayOverride?: number;
  isBlocked: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  suspendLastMinute: boolean;
  suspendGapFill: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GroupPricingRuleSchema = new Schema<IGroupPricingRule>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: "PropertyGroup", required: true, index: true },
    ruleType: {
      type: String,
      enum: ["SEASON", "EVENT", "ADMIN_BLOCK", "LOS_DISCOUNT"],
      required: true,
    },
    ruleCategory: { type: String },
    name: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    priority: { type: Number, default: 50 },
    startDate: String,
    endDate: String,
    daysOfWeek: [Number],
    minNights: Number,
    priceOverride: Number,
    priceAdjPct: Number,
    minPriceOverride: Number,
    maxPriceOverride: Number,
    minStayOverride: Number,
    isBlocked: { type: Boolean, default: false },
    closedToArrival: { type: Boolean, default: false },
    closedToDeparture: { type: Boolean, default: false },
    suspendLastMinute: { type: Boolean, default: false },
    suspendGapFill: { type: Boolean, default: false },
  },
  { timestamps: true }
);

GroupPricingRuleSchema.index({ groupId: 1, enabled: 1 });

export const GroupPricingRule: Model<IGroupPricingRule> =
  mongoose.models.GroupPricingRule ??
  mongoose.model<IGroupPricingRule>("GroupPricingRule", GroupPricingRuleSchema);