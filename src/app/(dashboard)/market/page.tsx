import { MarketIntelligenceClient } from "./market-client";
import { getSession } from "@/lib/auth/server";
import { cookies } from "next/headers";
import { format, addDays } from "date-fns";
import { apiBase } from "@/lib/api/absolute-url";
import { resolveDtcmEligibility } from "@/lib/research/dtcm-eligibility";
import mongoose from "mongoose";


export default async function MarketPage() {
  const API = await apiBase();
  const session = await getSession();
  if (!session?.orgId) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const plus89Str = format(addDays(new Date(), 89), "yyyy-MM-dd");
  const plus29Str = format(addDays(new Date(), 29), "yyyy-MM-dd");

  // Fetch data in parallel — short-TTL cache to speed up repeat navigation
  const [eventsRes, metricsRes, listingsRes, revRes] = await Promise.all([
    fetch(`${API}/agent-tools/market-events?orgId=${session.orgId}&dateFrom=${todayStr}&dateTo=${plus89Str}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 }, // events change infrequently
    }),
    fetch(`${API}/agent-tools/portfolio-overview?orgId=${session.orgId}&dateFrom=${todayStr}&dateTo=${plus29Str}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 60 },
    }),
    fetch(`${API}/listings/?orgId=${session.orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 120 },
    }),
    fetch(`${API}/agent-tools/revenue-snapshot?orgId=${session.orgId}&dateFrom=${todayStr}&dateTo=${plus29Str}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 60 },
    }),
  ]).catch(() => [null, null, null, null]);

  const eventsData = eventsRes?.ok ? await eventsRes.json() : { events: [] };
  const metricsData = metricsRes?.ok ? await metricsRes.json() : { avgOccupancyPct: 0 };
  const listingsData = listingsRes?.ok ? await listingsRes.json() : { listings: [] };
  const revData = revRes?.ok ? await revRes.json() : { totals: { avgBookingValue: 0 } };

  const formattedEvents = (eventsData.events ?? []).map((e: {
    id?: string;
    name: string;
    startDate: string;
    endDate: string;
    impactLevel: string;
    upliftPct?: number;
    description?: string;
    category?: string;
    area?: string;
    source?: string;
    confidence?: number;
    signalScore?: number;
    verified?: boolean;
  }) => ({
    id: e.id || Math.random().toString(36).substr(2, 9),
    title: e.name,
    startDate: e.startDate,
    endDate: e.endDate,
    impact: e.impactLevel,
    suggestedPremiumPct: e.upliftPct ?? 0,
    description: e.description || "",
    category: e.category || "Event",
    area: e.area || "Dubai",
    source: e.source,
    confidence: e.confidence ?? 0,
    signalScore: e.signalScore ?? 0,
    verified: e.verified ?? false,
  }));

  const sourceCounts = eventsData.sourceCounts ?? {};
  const dtcmEligibility = await resolveDtcmEligibility(
    new mongoose.Types.ObjectId(session.orgId)
  );

  const formattedListings = (listingsData.listings ?? []).map((l: any) => ({
    id: l.id,
    name: l.name,
    currencyCode: l.currencyCode || "AED",
    area: l.area,
  }));

  return (
    <MarketIntelligenceClient
      orgId={session.orgId}
      events={formattedEvents}
      sourceCounts={sourceCounts}
      dtcmEligibility={dtcmEligibility}
      occupancyPct={metricsData.avgOccupancyPct || 0}
      avgNightly={metricsData.avgNightlyRate || 0}
      listings={formattedListings}
    />
  );
}


