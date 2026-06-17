import { NextRequest, NextResponse } from "next/server";
import { connectDB, InventoryMaster, Listing, Reservation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { refreshListingCalendarFromHostaway } from "@/lib/engine/calendar-rates";
import { resolveDisplayRate } from "@/lib/pricing/display-rate";
import { format } from "date-fns";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const listingId = searchParams.get("listingId");
        const from = searchParams.get("from");
        const to = searchParams.get("to");

        if (!listingId || !from || !to) {
            return NextResponse.json(
                { error: "listingId, from, and to are required" },
                { status: 400 }
            );
        }

        await connectDB();

        const lid = new mongoose.Types.ObjectId(listingId);

        try {
            await refreshListingCalendarFromHostaway(
                lid,
                new Date(from),
                new Date(to)
            );
        } catch (err) {
            console.warn("[calendar-metrics] Hostaway refresh skipped:", (err as Error).message);
        }

        // Aggregate metrics from InventoryMaster
        const [agg] = await InventoryMaster.aggregate([
            { $match: { listingId: lid, date: { $gte: from, $lte: to } } },
            {
                $group: {
                    _id: null,
                    totalDays: { $sum: 1 },
                    bookedDays: {
                        $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] },
                    },
                    availableDays: {
                        $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] },
                    },
                    blockedDays: {
                        $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] },
                    },
                    avgPrice: { $avg: "$currentPrice" },
                },
            },
        ]);

        let totalDays = Number(agg?.totalDays || 0);
        let bookedDays = Number(agg?.bookedDays || 0);
        let availableDays = Number(agg?.availableDays || 0);
        let blockedDays = Number(agg?.blockedDays || 0);
        const avgCalendarRate = agg?.avgPrice ? Number(agg.avgPrice) : null;

        const listing = await Listing.findById(lid).select("price currencyCode").lean();
        const listedPrice = Number(listing?.price ?? 0);

        const bookableDays = totalDays - blockedDays;
        const occupancy =
            bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0;

        // Calendar days
        const calendarDocs = await InventoryMaster.find({
            listingId: lid,
            date: { $gte: from, $lte: to },
        })
            .sort({ date: 1 })
            .select("date status currentPrice")
            .lean();

        const calendarDays = calendarDocs.map((d) => ({
            date: d.date,
            status: d.status,
            price: Number(d.currentPrice),
        }));

        const todayStr = format(new Date(), "yyyy-MM-dd");
        const calendarListedPrice =
            calendarDays.find((d) => d.date === todayStr)?.price ??
            calendarDays.find((d) => d.price > 0)?.price ??
            0;

        const rateDisplay = resolveDisplayRate({
            listedPrice,
            calendarPrices: calendarDays.map((d) => d.price),
            avgCalendarRate,
            calendarListedPrice,
        });

        // Reservations overlapping the range
        const resDocs = await Reservation.find({
            listingId: lid,
            checkIn: { $lte: to },
            checkOut: { $gte: from },
        }).lean();

        const reservations = resDocs.map((r) => ({
            guestName: r.guestName,
            startDate: r.checkIn,
            endDate: r.checkOut,
            totalPrice: r.totalPrice,
            pricePerNight:
                r.nights > 0 ? Math.round(r.totalPrice / r.nights) : r.totalPrice,
            channelName: r.channelName,
            reservationStatus: r.status,
        }));

        return NextResponse.json({
            listingId,
            dateRange: { from, to },
            totalDays,
            bookedDays,
            availableDays,
            blockedDays,
            bookableDays,
            occupancy,
            listedPrice: rateDisplay.listedPrice,
            avgCalendarRate: rateDisplay.avgCalendarRate,
            displayRate: rateDisplay.displayRate,
            rateLabel: rateDisplay.rateLabel,
            /** @deprecated use displayRate — kept for chat context compatibility */
            avgPrice: rateDisplay.displayRate,
            calendarDays,
            reservations,
        });
    } catch (error) {
        console.error("Calendar Metrics Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal Server Error" },
            { status: 500 }
        );
    }
}
