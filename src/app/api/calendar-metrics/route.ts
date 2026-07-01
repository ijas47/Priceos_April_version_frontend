import { NextRequest, NextResponse } from "next/server";
import { connectDB, InventoryMaster, Reservation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { assertListingOwned, ListingAccessError, orgObjectId } from "@/lib/db/assert-listing-owned";
import { refreshListingCalendarFromHostaway } from "@/lib/engine/calendar-rates";
import { resolveDisplayRate } from "@/lib/pricing/display-rate";
import { computeOccupancyMetrics } from "@/lib/pricing/occupancy-metrics";
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

        const listing = await assertListingOwned(session.orgId, listingId);
        const lid = listing._id;
        const orgOid = orgObjectId(session.orgId);

        try {
            await refreshListingCalendarFromHostaway(
                lid,
                new Date(from),
                new Date(to)
            );
        } catch (err) {
            console.warn("[calendar-metrics] Hostaway refresh skipped:", (err as Error).message);
        }

        const calendarDocs = await InventoryMaster.find({
            orgId: orgOid,
            listingId: lid,
            date: { $gte: from, $lte: to },
        })
            .sort({ date: 1 })
            .select("date status currentPrice")
            .lean();

        const resDocs = await Reservation.find({
            orgId: orgOid,
            listingId: lid,
            checkIn: { $lte: to },
            checkOut: { $gte: from },
        })
            .select("checkIn checkOut status")
            .lean();

        const occupancyMetrics = computeOccupancyMetrics(
            calendarDocs.map((d) => ({
                date: d.date,
                status: d.status,
                currentPrice: d.currentPrice,
            })),
            resDocs.map((r) => ({
                checkIn: r.checkIn,
                checkOut: r.checkOut,
                status: r.status,
            }))
        );

        const {
            totalDays,
            bookedDays,
            availableDays,
            blockedDays,
            bookableDays,
            occupancyPct: occupancy,
        } = occupancyMetrics;

        const avgCalendarRate =
            calendarDocs.length > 0
                ? calendarDocs.reduce((s, d) => s + Number(d.currentPrice || 0), 0) /
                  calendarDocs.length
                : null;

        const listedPrice = Number(listing.price ?? 0);

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
            occupancyPeriod: { from, to },
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
            /** @deprecated use displayRate - kept for chat context compatibility */
            avgPrice: rateDisplay.displayRate,
            calendarDays,
            reservations,
        });
    } catch (error) {
        if (error instanceof ListingAccessError) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }
        console.error("Calendar Metrics Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal Server Error" },
            { status: 500 }
        );
    }
}
