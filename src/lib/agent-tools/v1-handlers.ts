import mongoose from "mongoose";
import { format, addDays } from "date-fns";
import {
  connectDB,
  Listing,
  InventoryMaster,
  Reservation,
  MarketEvent,
  BenchmarkData,
  GuestSummary,
  HostawayConversation,
  EngineRun,
  Insight,
} from "@/lib/db";
import { assertListingOwned } from "@/lib/db/assert-listing-owned";
import { orgObjectId } from "@/lib/db/assert-listing-owned";
import { computeOccupancyMetrics } from "@/lib/pricing/occupancy-metrics";
import { resolveDisplayRate } from "@/lib/pricing/display-rate";
import { resolveBedroomsNumber } from "@/lib/pricing/bedrooms";
import { scoreMarketEvent, compareEventSignals, confidenceFromSource } from "@/lib/research/event-scoring";
import { resolveEventDisplayArea } from "@/lib/research/event-area";
import {
  enforceDateWindow,
  isObjectId,
  type ScopedSession,
} from "@/lib/agent-tools/utils";

function orgOid(orgId: string) {
  return new mongoose.Types.ObjectId(orgId);
}

export async function handleGetPortfolioOverview(
  orgId: string,
  dateFrom: string,
  dateTo: string
) {
  enforceDateWindow(dateFrom, dateTo);
  await connectDB();
  const oid = orgOid(orgId);

  const [listingCount, inventory, reservations] = await Promise.all([
    Listing.countDocuments({ orgId: oid }),
    InventoryMaster.find({ orgId: oid, date: { $gte: dateFrom, $lte: dateTo } })
      .select("date status currentPrice")
      .lean(),
    Reservation.find({
      orgId: oid,
      checkIn: { $lte: dateTo },
      checkOut: { $gte: dateFrom },
      status: { $ne: "cancelled" },
    })
      .select("checkIn checkOut status")
      .lean(),
  ]);

  const metrics = computeOccupancyMetrics(inventory, reservations);
  const avgNightlyRate =
    inventory.length > 0
      ? Math.round(
          inventory.reduce((s, d) => s + Number(d.currentPrice || 0), 0) /
            inventory.length
        )
      : 0;

  return {
    dateFrom,
    dateTo,
    listingCount,
    totalDays: metrics.totalDays,
    bookedDays: metrics.bookedDays,
    avgOccupancyPct: metrics.occupancyPct,
    avgNightlyRate,
    bookedRevenue: Math.round(
      inventory
        .filter((d) => d.status === "booked" || d.status === "pending")
        .reduce((s, d) => s + Number(d.currentPrice || 0), 0)
    ),
  };
}

export async function handleGetAgentSystemStatus(orgId: string) {
  await connectDB();
  const oid = orgOid(orgId);

  const [lastEngineRun, pendingProposals, criticalInsights] = await Promise.all([
    EngineRun.findOne({ orgId: oid }).sort({ startedAt: -1 }).lean(),
    InventoryMaster.countDocuments({ orgId: oid, proposalStatus: "pending" }),
    Insight.countDocuments({ orgId: oid, severity: "high", status: "pending" }),
  ]);

  const lastRunAt = lastEngineRun?.startedAt ?? null;
  const dataAgeSec = lastRunAt
    ? Math.floor((Date.now() - new Date(lastRunAt).getTime()) / 1000)
    : null;

  return {
    status: "ok",
    lastEngineRunAt: lastRunAt,
    lastEngineRunStatus: lastEngineRun?.status ?? "never_run",
    pendingProposals,
    criticalInsights,
    dataAgeSec,
    isStale: dataAgeSec != null && dataAgeSec > 4 * 3600,
  };
}

export async function handleGetPortfolioRevenueSnapshot(
  orgId: string,
  dateFrom: string,
  dateTo: string
) {
  enforceDateWindow(dateFrom, dateTo);
  await connectDB();

  const reservations = await Reservation.find({
    orgId: orgOid(orgId),
    status: { $ne: "cancelled" },
    checkIn: { $lte: dateTo },
    checkOut: { $gte: dateFrom },
  })
    .select("totalPrice nights channelName listingId checkIn")
    .lean();

  const totalRevenue = reservations.reduce((s, r) => s + (r.totalPrice || 0), 0);
  const totalNights = reservations.reduce((s, r) => s + (r.nights || 1), 0);

  return {
    dateFrom,
    dateTo,
    totals: {
      totalRevenue: Math.round(totalRevenue),
      totalBookings: reservations.length,
      totalNights,
      avgBookingValue:
        reservations.length > 0
          ? Math.round(totalRevenue / reservations.length)
          : 0,
      adr: totalNights > 0 ? Math.round(totalRevenue / totalNights) : 0,
    },
  };
}

export async function handleGetPropertyProfile(orgId: string, listingId: string) {
  if (!isObjectId(listingId)) throw new Error("INVALID_LISTING_ID");
  await connectDB();
  const listing = await assertListingOwned(orgId, listingId);
  const rateDisplay = resolveDisplayRate({
    listedPrice: Number(listing.price ?? 0),
    calendarPrices: [],
    avgCalendarRate: null,
    calendarListedPrice: Number(listing.price ?? 0),
  });

  return {
    listingId,
    name: listing.name,
    area: listing.area || "",
    city: listing.city || "",
    countryCode: listing.countryCode || "AE",
    bedrooms: resolveBedroomsNumber(listing.bedroomsNumber, 1),
    bathrooms: listing.bathroomsNumber ?? 1,
    personCapacity: listing.personCapacity ?? 0,
    current_price: rateDisplay.displayRate,
    listed_price: rateDisplay.listedPrice,
    rate_label: rateDisplay.rateLabel,
    floor_price: Number(listing.priceFloor ?? 0),
    ceiling_price: Number(listing.priceCeiling ?? 0),
    currency: listing.currencyCode || "AED",
    isActive: listing.isActive !== false,
  };
}

export async function handleGetPropertyCalendarMetrics(
  orgId: string,
  listingId: string,
  dateFrom: string,
  dateTo: string
) {
  enforceDateWindow(dateFrom, dateTo);
  if (!isObjectId(listingId)) throw new Error("INVALID_LISTING_ID");
  await connectDB();

  const listing = await assertListingOwned(orgId, listingId);
  const lid = listing._id;
  const oid = orgObjectId(orgId);

  const [calendarDocs, resDocs] = await Promise.all([
    InventoryMaster.find({
      orgId: oid,
      listingId: lid,
      date: { $gte: dateFrom, $lte: dateTo },
    })
      .sort({ date: 1 })
      .select("date status currentPrice")
      .lean(),
    Reservation.find({
      orgId: oid,
      listingId: lid,
      checkIn: { $lte: dateTo },
      checkOut: { $gte: dateFrom },
    })
      .select("checkIn checkOut status guestName totalPrice nights channelName")
      .lean(),
  ]);

  const metrics = computeOccupancyMetrics(calendarDocs, resDocs);
  const rateDisplay = resolveDisplayRate({
    listedPrice: Number(listing.price ?? 0),
    calendarPrices: calendarDocs.map((d) => Number(d.currentPrice || 0)),
    avgCalendarRate:
      calendarDocs.length > 0
        ? calendarDocs.reduce((s, d) => s + Number(d.currentPrice || 0), 0) /
          calendarDocs.length
        : null,
    calendarListedPrice: Number(calendarDocs[0]?.currentPrice ?? listing.price ?? 0),
  });

  return {
    listingId,
    dateRange: { from: dateFrom, to: dateTo },
    ...metrics,
    occupancy: metrics.occupancyPct,
    listedPrice: rateDisplay.listedPrice,
    displayRate: rateDisplay.displayRate,
    rateLabel: rateDisplay.rateLabel,
    calendarDays: calendarDocs.map((d) => ({
      date: d.date,
      status: d.status,
      price: Number(d.currentPrice || 0),
    })),
    reservations: resDocs.map((r) => ({
      guestName: r.guestName,
      startDate: r.checkIn,
      endDate: r.checkOut,
      totalPrice: r.totalPrice,
      nights: r.nights,
      channelName: r.channelName,
      reservationStatus: r.status,
    })),
  };
}

export async function handleGetPropertyReservations(
  orgId: string,
  listingId: string,
  dateFrom: string,
  dateTo: string,
  limit = 100
) {
  enforceDateWindow(dateFrom, dateTo);
  if (!isObjectId(listingId)) throw new Error("INVALID_LISTING_ID");
  await connectDB();

  const listing = await assertListingOwned(orgId, listingId);
  const rows = await Reservation.find({
    orgId: orgOid(orgId),
    listingId: listing._id,
    checkIn: { $lte: dateTo },
    checkOut: { $gte: dateFrom },
  })
    .sort({ checkIn: -1 })
    .limit(Math.min(limit, 500))
    .lean();

  return {
    listingId,
    dateFrom,
    dateTo,
    count: rows.length,
    reservations: rows.map((r) => ({
      guestName: r.guestName,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      nights: r.nights,
      totalPrice: r.totalPrice,
      channelName: r.channelName,
      status: r.status,
    })),
  };
}

export async function handleGetPropertyMarketEvents(
  orgId: string,
  dateFrom: string,
  dateTo: string,
  listingId?: string
) {
  enforceDateWindow(dateFrom, dateTo);
  await connectDB();
  const oid = orgOid(orgId);

  const scope: Record<string, unknown> = {
    orgId: oid,
    isActive: { $ne: false },
    startDate: { $lte: dateTo },
    endDate: { $gte: dateFrom },
  };

  if (listingId && isObjectId(listingId)) {
    const lid = new mongoose.Types.ObjectId(listingId);
    scope.$or = [
      { listingId: lid },
      { listingId: { $exists: false } },
      { listingId: null },
    ];
  }

  const docs = await MarketEvent.find(scope).limit(300).lean();
  const mapped = docs.map((e) => {
    const confidence =
      e.confidence != null ? Number(e.confidence) : confidenceFromSource(e.source);
    const scored = scoreMarketEvent({
      source: e.source,
      impactLevel: e.impactLevel,
      upliftPct: e.upliftPct,
      confidence,
      startDate: e.startDate,
    });
    const desc = String(e.description ?? "");
    const isNews = e.source === "newsapi" || desc.includes("[news]");
    return {
      id: e._id.toString(),
      name: e.name,
      startDate: e.startDate,
      endDate: e.endDate,
      impactLevel: e.impactLevel,
      upliftPct: e.upliftPct ?? 0,
      description: desc,
      category: isNews ? "News" : "Event",
      source: e.source,
      confidence,
      signalScore: scored.signalScore,
    };
  });

  return {
    dateFrom,
    dateTo,
    events: mapped.sort(compareEventSignals).slice(0, 50),
  };
}

export async function handleGetPropertyBenchmark(
  orgId: string,
  listingId: string,
  dateFrom: string,
  dateTo: string
) {
  enforceDateWindow(dateFrom, dateTo);
  if (!isObjectId(listingId)) throw new Error("INVALID_LISTING_ID");
  await connectDB();

  const listing = await assertListingOwned(orgId, listingId);
  const row = await BenchmarkData.findOne({
    orgId: orgOid(orgId),
    listingId: listing._id,
    dateFrom: { $lte: dateTo },
    dateTo: { $gte: dateFrom },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!row) {
    return { hasData: false, listingId, dateFrom, dateTo, benchmark: null };
  }

  return {
    hasData: true,
    listingId,
    dateFrom,
    dateTo,
    benchmark: {
      verdict: row.verdict,
      percentile: row.percentile,
      p25: Number(row.p25Rate || 0),
      p50: Number(row.p50Rate || 0),
      p75: Number(row.p75Rate || 0),
      p90: Number(row.p90Rate || 0),
      recommended_weekday: Number(row.recommendedWeekday || 0),
      recommended_weekend: Number(row.recommendedWeekend || 0),
      recommended_event: Number(row.recommendedEvent || 0),
      reasoning: row.reasoning || "",
      comps: row.comps ?? [],
    },
  };
}

export async function handleListGuestConversations(
  orgId: string,
  listingId: string,
  dateFrom: string,
  dateTo: string
) {
  enforceDateWindow(dateFrom, dateTo);
  if (!isObjectId(listingId)) throw new Error("INVALID_LISTING_ID");
  await connectDB();

  const listing = await assertListingOwned(orgId, listingId);
  const rows = await HostawayConversation.find({
    orgId: orgOid(orgId),
    listingId: listing._id,
    dateFrom: { $lte: dateTo },
    dateTo: { $gte: dateFrom },
  })
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  return {
    listingId,
    dateFrom,
    dateTo,
    count: rows.length,
    conversations: rows.map((c) => ({
      id: c.hostawayConversationId,
      guestName: c.guestName,
      status: c.needsReply ? "needs_reply" : "resolved",
      unreadCount: c.needsReply ? 1 : 0,
      messageCount: c.messages?.length ?? 0,
      lastMessageAt: c.messages?.[c.messages.length - 1]?.timestamp ?? null,
    })),
  };
}

export async function handleGetGuestSummary(
  orgId: string,
  listingId: string,
  dateFrom: string,
  dateTo: string
) {
  enforceDateWindow(dateFrom, dateTo);
  if (!isObjectId(listingId)) throw new Error("INVALID_LISTING_ID");
  await connectDB();

  const listing = await assertListingOwned(orgId, listingId);
  const row = await GuestSummary.findOne({
    orgId: orgOid(orgId),
    listingId: listing._id,
    dateFrom: { $lte: dateTo },
    dateTo: { $gte: dateFrom },
  })
    .sort({ updatedAt: -1 })
    .lean();

  return {
    listingId,
    dateFrom,
    dateTo,
    cached: !!row,
    summary: row
      ? {
          sentiment: row.sentiment,
          themes: row.themes ?? [],
          actionItems: row.actionItems ?? [],
          bulletPoints: row.bulletPoints ?? [],
          totalConversations: row.totalConversations ?? 0,
          needsReplyCount: row.needsReplyCount ?? 0,
        }
      : null,
  };
}

export function parseToolQuery(
  searchParams: URLSearchParams,
  required: string[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of required) {
    const val = searchParams.get(key);
    if (!val) throw new Error(`MISSING_PARAM:${key}`);
    out[key] = val;
  }
  return out;
}

export function defaultDateRange(): { dateFrom: string; dateTo: string } {
  return {
    dateFrom: format(new Date(), "yyyy-MM-dd"),
    dateTo: format(addDays(new Date(), 29), "yyyy-MM-dd"),
  };
}

export type ToolHandlerContext = ScopedSession;