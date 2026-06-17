import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB, InventoryMaster } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { changePctFromPrices } from "@/lib/pricing/bulk-adjust";

/** POST /api/proposals/bulk-modify - set absolute price or % shift on pending proposals. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const proposalIds: string[] = body.proposalIds;
    const newPrice = body.newPrice != null ? Number(body.newPrice) : null;
    const adjPct = body.adjPct != null ? Number(body.adjPct) : null;

    if (!Array.isArray(proposalIds) || proposalIds.length === 0) {
      return NextResponse.json({ error: "proposalIds required" }, { status: 400 });
    }
    if (newPrice == null && adjPct == null) {
      return NextResponse.json({ error: "newPrice or adjPct required" }, { status: 400 });
    }
    if (newPrice != null && (!Number.isFinite(newPrice) || newPrice <= 0)) {
      return NextResponse.json({ error: "Invalid newPrice" }, { status: 400 });
    }
    if (adjPct != null && (!Number.isFinite(adjPct) || adjPct < -50 || adjPct > 50)) {
      return NextResponse.json({ error: "adjPct must be between -50 and +50" }, { status: 400 });
    }

    const ids = proposalIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (ids.length === 0) {
      return NextResponse.json({ error: "No valid proposal IDs" }, { status: 400 });
    }

    await connectDB();
    const orgId = new mongoose.Types.ObjectId(session.orgId);

    const proposals = await InventoryMaster.find({
      _id: { $in: ids },
      orgId,
      proposalStatus: { $in: ["pending", "rejected"] },
    })
      .select("_id currentPrice proposedPrice")
      .lean();

    if (proposals.length === 0) {
      return NextResponse.json({ error: "No matching proposals" }, { status: 404 });
    }

    const bulkOps = proposals.map((p) => {
      const current = Number(p.currentPrice || 0);
      const base = Number(p.proposedPrice ?? p.currentPrice ?? 0);
      const price =
        newPrice != null
          ? Math.round(newPrice)
          : Math.round(base * (1 + (adjPct as number) / 100));
      const changePct = changePctFromPrices(current, price) ?? undefined;

      return {
        updateOne: {
          filter: { _id: p._id, orgId },
          update: {
            $set: {
              proposedPrice: price,
              ...(changePct !== undefined ? { changePct } : {}),
              proposalStatus: "pending" as const,
            },
          },
        },
      };
    });

    const result = await InventoryMaster.bulkWrite(bulkOps, { ordered: false });

    return NextResponse.json({ success: true, count: result.modifiedCount });
  } catch (error) {
    console.error("[Proposals bulk-modify]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}