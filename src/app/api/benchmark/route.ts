import { NextRequest, NextResponse } from "next/server";
import { connectDB, BenchmarkData } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import {
    getCalendarAvgPrice,
    refreshListingCalendarFromHostaway,
} from "@/lib/engine/calendar-rates";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

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

        const lid = new mongoose.Types.ObjectId(listingId);

        if (dateFrom && dateTo) {
            try {
                await refreshListingCalendarFromHostaway(
                    lid,
                    new Date(dateFrom),
                    new Date(dateTo)
                );
            } catch (err) {
                console.warn("[benchmark] Hostaway refresh skipped:", (err as Error).message);
            }
        }

        const row = await BenchmarkData.findOne(query)
            .sort({ createdAt: -1 })
            .lean();

        let summary: Record<string, unknown> | null = row
            ? ({ ...row } as Record<string, unknown>)
            : null;
        if (summary && dateFrom && dateTo) {
            const calendarAvg = await getCalendarAvgPrice(lid, dateFrom, dateTo);
            if (calendarAvg > 0) {
                summary = {
                    ...summary,
                    yourPrice: Math.round(calendarAvg),
                    priceSource: "hostaway_calendar",
                };
            }
        }

        console.log(
            `📊 [Benchmark API] listingId=${listingId} range=${dateFrom}→${dateTo} → ${
                row ? `FOUND` : "NO DATA"
            }`
        );

        return NextResponse.json({
            success: true,
            hasData: !!summary,
            summary,
            comps: (summary as { comps?: unknown[] } | null)?.comps ?? [],
            totalComps: (summary as { comps?: unknown[] } | null)?.comps?.length ?? 0,
        });
    } catch (error) {
        console.error("API /api/benchmark GET Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch benchmark data." },
            { status: 500 }
        );
    }
}
