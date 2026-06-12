import { NextRequest, NextResponse } from "next/server";
import { connectDB, InventoryMaster } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { proposals } = await req.json();
    if (!Array.isArray(proposals) || proposals.length === 0) {
      return NextResponse.json({ error: "No proposals provided" }, { status: 400 });
    }

    await connectDB();
    const batchId = new mongoose.Types.ObjectId().toString();

    const ops = proposals.map((p: {
      listingId: string;
      date: string;
      proposedPrice: number;
      changePct?: number;
      reasoning?: string;
    }) => ({
      updateOne: {
        filter: {
          listingId: new mongoose.Types.ObjectId(p.listingId),
          date: p.date,
          orgId: new mongoose.Types.ObjectId(session!.orgId),
        },
        update: {
          $set: {
            proposedPrice: p.proposedPrice,
            proposalStatus: "pending" as const,
            changePct: p.changePct ?? undefined,
            reasoning: p.reasoning ?? undefined,
            batchId,
          },
        },
        upsert: false,
      },
    }));

    const result = await InventoryMaster.bulkWrite(ops);
    return NextResponse.json({ success: true, batchId, modified: result.modifiedCount });
  } catch (error) {
    console.error("[Proposals bulk-save]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
