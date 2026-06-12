import { NextRequest, NextResponse } from "next/server";
import { connectDB, InventoryMaster, Listing, Reservation } from "@/lib/db";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
    try {
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
        let avgPriceVal = agg?.avgPrice ? Number(agg.avgPrice) : 0;

        // Fallback to listing base price if no inventory data
        if (avgPriceVal === 0) {
            const prop = await Listing.findById(lid).select("price").lean();
            if (prop) avgPriceVal = Number(prop.price);
        }

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
            avgPrice: Math.round(avgPriceVal * 100) / 100,
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
