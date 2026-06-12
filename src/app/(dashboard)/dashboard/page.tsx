/**
 * dashboard/page.tsx — Server Component
 *
 * Fetches portfolio data from the FastAPI backend.
 * All MongoDB queries moved to priceos-backend; this page is pure UI + data fetch.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { OverviewClient } from "./overview-client";
import { apiBase } from "@/lib/api/absolute-url";


export default async function OverviewPage() {
  const API = await apiBase();
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  if (!token) redirect("/login");

  let orgId: string;
  try {
    const payload = verifyAccessToken(token!);
    orgId = payload.orgId;
  } catch {
    redirect("/login");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const plus29 = new Date(today);
  plus29.setDate(plus29.getDate() + 29);
  const plus29Str = plus29.toISOString().split("T")[0];
  // For channel chart: include past 365 days so historical revenue is captured
  const minus365 = new Date(today);
  minus365.setDate(minus365.getDate() - 365);
  const minus365Str = minus365.toISOString().split("T")[0];

  // Fetch all data in parallel from FastAPI, but don't 500 if backend is down.
  const [listingsResS, inventoryResS, reservationsResS] = await Promise.allSettled([
    fetch(`${API}/listings/?orgId=${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }),
    fetch(`${API}/inventory/portfolio?orgId=${orgId}&startDate=${todayStr}&endDate=${plus29Str}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }),
    // Wide date range: past 365 days through next 30 days so Revenue By Channel shows historical data
    fetch(`${API}/reservations?orgId=${orgId}&checkIn=${minus365Str}&checkOut=${plus29Str}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }),
  ]);

  const listingsRes = listingsResS.status === "fulfilled" ? listingsResS.value : null;
  const inventoryRes = inventoryResS.status === "fulfilled" ? inventoryResS.value : null;
  const reservationsRes = reservationsResS.status === "fulfilled" ? reservationsResS.value : null;

  const allListings = listingsRes?.ok ? (await listingsRes.json()).listings ?? [] : [];
  const invData = inventoryRes?.ok ? (await inventoryRes.json()) : { inventory: [] };
  const resData = reservationsRes?.ok ? (await reservationsRes.json()) : { reservations: [] };

  const inventory: any[] = invData.inventory ?? [];
  const reservations: any[] = resData.reservations ?? [];

  // Compute per-listing metrics client-side from raw API data
  let totalPortfolioRevenue = 0;
  let totalOccupancySum = 0;
  let totalAvgPriceSum = 0;
  let activePropertiesCount = 0;

  const propertiesWithMetrics = allListings.map((listing: any) => {
    const listingId = listing.id ?? listing._id;

    const listingInv = inventory.filter((r) => (r.listingId ?? r.listing_id) === listingId);
    const bookedInv = listingInv.filter((r) => r.status === "booked" || r.status === "reserved");
    const bookedDays = bookedInv.length;
    const totalDays = listingInv.length;
    const occupancy = totalDays > 0 ? Math.round((bookedDays / totalDays) * 100) : 0;

    // ADR from actual Hostaway-synced reservations (totalPrice / nights per booking)
    const listingReservations = reservations.filter(
      (r) => (r.listingId ?? r.listing_id) === listingId && r.status !== "cancelled"
    );
    const adrEntries = listingReservations
      .filter((r) => Number(r.totalPrice) > 0 && Number(r.nights) > 0)
      .map((r) => Number(r.totalPrice) / Number(r.nights));
    const avgPrice = adrEntries.length > 0
      ? Math.round(adrEntries.reduce((a, b) => a + b, 0) / adrEntries.length)
      : Number(listing.price ?? 0);

    // Revenue = sum of all confirmed reservation payouts (historical + upcoming)
    const revenue = listingReservations.reduce((sum, r) => sum + Number(r.totalPrice ?? 0), 0);

    totalPortfolioRevenue += revenue;
    if (occupancy > 0) {
      totalOccupancySum += occupancy;
      totalAvgPriceSum += avgPrice;
      activePropertiesCount++;
    }

    const calendarDays = listingInv.map((r) => ({
      date: r.date,
      status: r.status,
      price: Number(r.proposedPrice ?? r.currentPrice ?? 0),
      minimumStay: Number(r.minStay ?? 1),
      maximumStay: Number(r.maxStay ?? 30),
    }));

    const listingRes = reservations
      .filter((r) => (r.listingId ?? r.listing_id) === listingId)
      .map((r) => ({
        title: r.guestName ?? "Guest",
        email: r.guestEmail,
        startDate: r.checkIn,
        endDate: r.checkOut,
        financials: {
          totalPrice: Number(r.totalPrice ?? 0),
          pricePerNight: r.nights > 0 ? Math.round(Number(r.totalPrice) / r.nights) : Number(r.totalPrice),
          channelName: r.channelName,
          reservationStatus: r.status,
        },
      }));

    return {
      id: listingId,
      name: listing.name,
      area: listing.area,
      bedroomsNumber: listing.bedroomsNumber,
      price: listing.price,
      occupancy,
      avgPrice,
      revenue,
      calendarDays,
      reservations: listingRes,
    };
  });

  const avgPortfolioOccupancy = activePropertiesCount > 0 ? Math.round(totalOccupancySum / activePropertiesCount) : 0;
  const avgPortfolioPrice = activePropertiesCount > 0 ? Math.round(totalAvgPriceSum / activePropertiesCount) : 0;

  return (
    <OverviewClient
      orgId={orgId}
      properties={propertiesWithMetrics}
      totalProperties={allListings.length}
      avgPortfolioOccupancy={avgPortfolioOccupancy}
      avgPortfolioPrice={avgPortfolioPrice}
      totalPortfolioRevenue={totalPortfolioRevenue}
      totalHistoricalRevenue={totalPortfolioRevenue}
    />
  );
}
