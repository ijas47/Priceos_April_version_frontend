import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB, InventoryMaster, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import {
  bulkAdjustReasoning,
  clampAdjustedPrice,
  changePctFromPrices,
  validateBulkAdjustInput,
  type BulkAdjustMode,
} from "@/lib/pricing/bulk-adjust";

export const maxDuration = 60;

interface BulkAdjustBody {
  adjPct: number;
  startDate: string;
  endDate: string;
  listingIds?: string[];
  mode?: BulkAdjustMode;
  onlyAvailable?: boolean;
  dryRun?: boolean;
}

/** POST /api/inventory/bulk-adjust — portfolio % shift on calendar or proposals. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as BulkAdjustBody;
    const validationError = validateBulkAdjustInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const {
      adjPct,
      startDate,
      endDate,
      listingIds,
      mode = "proposals",
      onlyAvailable = true,
      dryRun = false,
    } = body;

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);

    const listingQuery: Record<string, unknown> = { orgId, isActive: true };
    if (Array.isArray(listingIds) && listingIds.length > 0) {
      const ids = listingIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      if (ids.length === 0) {
        return NextResponse.json({ error: "No valid listingIds" }, { status: 400 });
      }
      listingQuery._id = { $in: ids };
    }

    const listings = await Listing.find(listingQuery)
      .select("_id name priceFloor priceCeiling")
      .lean();

    if (listings.length === 0) {
      return NextResponse.json({ error: "No active listings matched" }, { status: 404 });
    }

    const guardrailByListing = new Map(
      listings.map((l) => [
        l._id.toString(),
        {
          priceFloor: Number(l.priceFloor || 0),
          priceCeiling: Number(l.priceCeiling || 0),
          name: l.name,
        },
      ])
    );

    const invQuery: Record<string, unknown> = {
      orgId,
      listingId: { $in: listings.map((l) => l._id) },
      date: { $gte: startDate, $lte: endDate },
    };
    if (onlyAvailable) invQuery.status = "available";

    const days = await InventoryMaster.find(invQuery)
      .select("_id listingId date currentPrice status")
      .lean();

    let wouldChange = 0;
    let clampedToFloor = 0;
    let clampedToCeiling = 0;
    const sample: Array<{
      listingName: string;
      date: string;
      currentPrice: number;
      newPrice: number;
    }> = [];

    const bulkOps: mongoose.mongo.AnyBulkWriteOperation[] = [];

    for (const day of days) {
      const lid = day.listingId?.toString();
      if (!lid) continue;
      const guard = guardrailByListing.get(lid);
      if (!guard) continue;

      const current = Number(day.currentPrice || 0);
      if (current <= 0) continue;

      const newPrice = clampAdjustedPrice(current, adjPct, guard);
      if (newPrice === current) continue;

      wouldChange += 1;
      const raw = Math.round(current * (1 + adjPct / 100));
      if (guard.priceFloor > 0 && raw < guard.priceFloor) clampedToFloor += 1;
      if (guard.priceCeiling > 0 && raw > guard.priceCeiling) clampedToCeiling += 1;

      if (sample.length < 8) {
        sample.push({
          listingName: guard.name,
          date: day.date,
          currentPrice: current,
          newPrice,
        });
      }

      if (dryRun) continue;

      if (mode === "calendar") {
        bulkOps.push({
          updateOne: {
            filter: { _id: day._id, orgId },
            update: { $set: { currentPrice: newPrice } },
          },
        });
      } else {
        const changePct = changePctFromPrices(current, newPrice);
        bulkOps.push({
          updateOne: {
            filter: { _id: day._id, orgId },
            update: {
              $set: {
                proposedPrice: newPrice,
                changePct,
                proposalStatus: "pending",
                reasoning: bulkAdjustReasoning(adjPct),
              },
            },
          },
        });
      }
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        mode,
        adjPct,
        startDate,
        endDate,
        listingsMatched: listings.length,
        daysScanned: days.length,
        daysAffected: wouldChange,
        clampedToFloor,
        clampedToCeiling,
        sample,
      });
    }

    let modifiedCount = 0;
    const BATCH = 500;
    for (let i = 0; i < bulkOps.length; i += BATCH) {
      const chunk = bulkOps.slice(i, i + BATCH);
      if (chunk.length === 0) continue;
      const result = await InventoryMaster.bulkWrite(chunk, { ordered: false });
      modifiedCount += result.modifiedCount;
    }

    return NextResponse.json({
      success: true,
      mode,
      adjPct,
      startDate,
      endDate,
      listingsMatched: listings.length,
      daysScanned: days.length,
      daysAffected: wouldChange,
      modifiedCount,
      clampedToFloor,
      clampedToCeiling,
      sample,
    });
  } catch (error) {
    console.error("[Inventory bulk-adjust]", error);
    return NextResponse.json({ error: "Failed to apply bulk adjustment" }, { status: 500 });
  }
}