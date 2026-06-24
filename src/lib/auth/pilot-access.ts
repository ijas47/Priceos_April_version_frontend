import mongoose from "mongoose";
import { connectDB, PilotAccessCode } from "@/lib/db";

export interface PilotCodeValidation {
  valid: boolean;
  reason?: string;
  plan?: "starter" | "growth" | "scale";
  codeId?: string;
  source?: "env" | "database" | "open_registration";
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "-");
}

export function isOpenRegistrationEnabled(): boolean {
  const flag = (process.env.ALLOW_OPEN_REGISTRATION ?? "false").toLowerCase();
  return flag === "true" || flag === "1";
}

/** Master pilot code from env (for early pilots before admin UI seed). */
export function envPilotBypassCode(): string | undefined {
  const raw = process.env.PILOT_BYPASS_CODE?.trim();
  return raw ? normalizeCode(raw) : undefined;
}

export async function validatePilotAccessCode(code: string): Promise<PilotCodeValidation> {
  const normalized = normalizeCode(code);

  if (!normalized) {
    return { valid: false, reason: "Access code is required" };
  }

  const envBypass = envPilotBypassCode();
  if (envBypass && normalized === envBypass) {
    return { valid: true, plan: "starter", source: "env" };
  }

  if (isOpenRegistrationEnabled()) {
    return { valid: true, plan: "starter", source: "open_registration" };
  }

  await connectDB();
  const doc = await PilotAccessCode.findOne({ code: normalized, isActive: true }).lean();
  if (!doc) {
    return { valid: false, reason: "Invalid or expired access code" };
  }

  if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) {
    return { valid: false, reason: "This access code has expired" };
  }

  if (doc.maxUses > 0 && doc.usedCount >= doc.maxUses) {
    return { valid: false, reason: "This access code has reached its use limit" };
  }

  return {
    valid: true,
    plan: doc.plan,
    codeId: doc._id.toString(),
    source: "database",
  };
}

export async function redeemPilotAccessCode(
  validation: PilotCodeValidation,
  orgId: string
): Promise<void> {
  if (!validation.valid || validation.source !== "database" || !validation.codeId) {
    return;
  }

  const orgOid = new mongoose.Types.ObjectId(orgId);
  await PilotAccessCode.findByIdAndUpdate(validation.codeId, {
    $inc: { usedCount: 1 },
    $addToSet: { redeemedBy: orgOid },
  });
}

export function generatePilotCodeValue(prefix = "PILOT"): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}