import { NextRequest, NextResponse } from "next/server";
import { connectDB, Listing, ChatMessage, InventoryMaster, Reservation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { addDays, format } from "date-fns";
import mongoose from "mongoose";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { message, propertyIds } = body;

        await connectDB();
        const session = await getSession();
        const orgId = session?.orgId
            ? new mongoose.Types.ObjectId(session.orgId)
            : new mongoose.Types.ObjectId();

        // Save user message
        await ChatMessage.create({
            orgId,
            sessionId: "global",
            role: "user",
            content: message,
            context: { type: "portfolio" },
            metadata: { propertyIds },
        });

        const lowerMessage = message.toLowerCase();
        let responseMessage = "";
        let metadata: Record<string, number> = {};
        const thirtyDaysAgoStr = format(addDays(new Date(), -30), "yyyy-MM-dd");

        if (lowerMessage.includes("underperform")) {
            const allListings = await Listing.find().lean();

            const listingsWithMetrics = await Promise.all(
                allListings.map(async (listing) => {
                    const [agg] = await InventoryMaster.aggregate([
                        { $match: { listingId: listing._id, date: { $gte: thirtyDaysAgoStr } } },
                        {
                            $group: {
                                _id: null,
                                totalDays: { $sum: 1 },
                                bookedDays: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] } },
                                blockedDays: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
                            },
                        },
                    ]);
                    const totalDays = agg?.totalDays || 1;
                    const bookedDays = agg?.bookedDays || 0;
                    const blockedDays = agg?.blockedDays || 0;
                    const bookableDays = totalDays - blockedDays;
                    const occupancy = bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0;
                    return { ...listing, occupancy };
                })
            );

            const underperforming = listingsWithMetrics.filter((l) => l.occupancy < 70);

            if (underperforming.length > 0) {
                responseMessage = `📊 I found ${underperforming.length} underperforming properties (occupancy < 70%):\n\n`;
                underperforming.forEach((property) => {
                    responseMessage += `• ${property.name}: ${property.occupancy}% occupancy\n`;
                    responseMessage += `  Current price: AED ${Number(property.price).toLocaleString("en-US")}/night\n`;
                    responseMessage += `  Suggestion: Consider price adjustments or targeted promotions\n\n`;
                });
                metadata = {
                    propertyCount: underperforming.length,
                    avgOccupancy: Math.round(underperforming.reduce((s, p) => s + p.occupancy, 0) / underperforming.length),
                };
            } else {
                responseMessage = `✅ Great news! All properties are performing well with occupancy rates above 70%.`;
                metadata = {
                    propertyCount: allListings.length,
                    avgOccupancy: Math.round(listingsWithMetrics.reduce((s, p) => s + p.occupancy, 0) / (listingsWithMetrics.length || 1)),
                };
            }
        } else if (lowerMessage.includes("revenue") || lowerMessage.includes("income")) {
            const recentReservations = await Reservation.find({ checkIn: { $gte: thirtyDaysAgoStr } }).lean();
            const totalRevenue = recentReservations.reduce((s, r) => s + Number(r.totalPrice || 0), 0);
            const allListings = await Listing.find().lean();

            responseMessage = `💰 Revenue Summary (Last 30 Days):\n\n`;
            responseMessage += `Total Revenue: AED ${totalRevenue.toLocaleString("en-US")}\n`;
            responseMessage += `Total Bookings: ${recentReservations.length}\n`;
            responseMessage += `Average Booking Value: AED ${Math.round(totalRevenue / (recentReservations.length || 1)).toLocaleString("en-US")}\n\n`;
            responseMessage += `This represents performance across ${allListings.length} properties.`;
            metadata = { propertyCount: allListings.length, totalRevenue: Math.round(totalRevenue) };
        } else {
            const allListings = await Listing.find().lean();

            const occupancies = await Promise.all(
                allListings.map(async (listing) => {
                    const [agg] = await InventoryMaster.aggregate([
                        { $match: { listingId: listing._id, date: { $gte: thirtyDaysAgoStr } } },
                        {
                            $group: {
                                _id: null,
                                totalDays: { $sum: 1 },
                                bookedDays: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] } },
                                blockedDays: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
                            },
                        },
                    ]);
                    const total = agg?.totalDays || 1;
                    const booked = agg?.bookedDays || 0;
                    const blocked = agg?.blockedDays || 0;
                    const bookable = total - blocked;
                    return bookable > 0 ? Math.round((booked / bookable) * 100) : 0;
                })
            );

            const avgOccupancy = Math.round(occupancies.reduce((s, o) => s + o, 0) / (occupancies.length || 1));
            const recentReservations = await Reservation.find({ checkIn: { $gte: thirtyDaysAgoStr } }).lean();
            const totalRevenue = recentReservations.reduce((s, r) => s + Number(r.totalPrice || 0), 0);

            responseMessage = `📊 Portfolio Overview:\n\n`;
            responseMessage += `Properties: ${allListings.length}\n`;
            responseMessage += `Average Occupancy: ${avgOccupancy}%\n`;
            responseMessage += `Total Revenue (30d): AED ${totalRevenue.toLocaleString("en-US")}\n`;
            responseMessage += `Total Bookings: ${recentReservations.length}\n\n`;
            responseMessage += `Ask me specific questions like:\n`;
            responseMessage += `• "Which properties are underperforming?"\n`;
            responseMessage += `• "Show me total revenue this month"\n`;
            responseMessage += `• "Generate proposals for all properties"`;
            metadata = { propertyCount: allListings.length, totalRevenue: Math.round(totalRevenue), avgOccupancy };
        }

        await ChatMessage.create({
            orgId,
            sessionId: "global",
            role: "assistant",
            content: responseMessage,
            context: { type: "portfolio" },
            metadata: { ...metadata, propertyIds },
        });

        return NextResponse.json({ message: responseMessage, metadata });
    } catch (error) {
        console.error("Error in global chat:", error);
        return NextResponse.json({ error: "Failed to process chat message" }, { status: 500 });
    }
}
