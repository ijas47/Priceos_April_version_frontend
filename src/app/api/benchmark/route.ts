import { NextRequest, NextResponse } from "next/server";
import { connectDB, BenchmarkData } from "@/lib/db";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const listingId = searchParams.get("listingId");
        const dateFrom = searchParams.get("dateFrom");
        const dateTo = searchParams.get("dateTo");

        if (!listingId) {
            return NextResponse.json({ error: "listingId is required" }, { status: 400 });
        }

        await connectDB();

        const query: Record<string, unknown> = {
            listingId: new mongoose.Types.ObjectId(listingId),
        };

        if (dateFrom && dateTo) {
            query.dateFrom = { $lte: dateTo };
            query.dateTo = { $gte: dateFrom };
        }

        const row = await BenchmarkData.findOne(query)
            .sort({ createdAt: -1 })
            .lean();

        console.log(
            `📊 [Benchmark API] listingId=${listingId} range=${dateFrom}→${dateTo} → ${
                row ? `FOUND` : "NO DATA"
            }`
        );

        return NextResponse.json({
            success: true,
            hasData: !!row,
            summary: row,
            comps: (row as any)?.comps ?? [],
            totalComps: (row as any)?.comps?.length ?? 0,
        });
    } catch (error) {
        console.error("API /api/benchmark GET Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch benchmark data." },
            { status: 500 }
        );
    }
}
