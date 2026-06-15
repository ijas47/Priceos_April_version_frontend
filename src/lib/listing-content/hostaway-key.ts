import mongoose from "mongoose";
import { connectDB, Organization } from "@/lib/db";
import { getHostawayApiKey } from "@/lib/env";

/** Org-scoped Hostaway key with global env fallback. */
export async function resolveHostawayApiKey(
  orgId: mongoose.Types.ObjectId | string
): Promise<string | null> {
  await connectDB();
  const oid = typeof orgId === "string" ? new mongoose.Types.ObjectId(orgId) : orgId;
  const org = await Organization.findById(oid).select("hostawayApiKey").lean();
  return org?.hostawayApiKey?.trim() || getHostawayApiKey() || null;
}