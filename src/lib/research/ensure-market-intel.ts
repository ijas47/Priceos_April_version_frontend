/**
 * Window-aware verified market intelligence.
 *
 * SERP / NewsAPI / ticketed feeds run here — never invented by Lyzr at chat time.
 * Chat and setup both call ensureVerifiedMarketIntel() so the injected window
 * always has fresh structured data when keys are configured.
 */

import mongoose from "mongoose";
import { connectDB, MarketEvent, BenchmarkData } from "@/lib/db";
import { gatherMarketIntelligence, type IntelFinding, type SourceBreakdownEntry } from "./aggregator";
import { resolveDtcmEligibility } from "./dtcm-eligibility";

export const VERIFIED_EVENT_SOURCES = [
    "ticketmaster",
    "eventbrite",
    "dtcm",
    "dcul",
    "serpapi",
    "newsapi",
] as const;

export type VerifiedEventSource = (typeof VERIFIED_EVENT_SOURCES)[number];

const DEFAULT_MAX_AGE_DAYS = 7;

export function sourceTagFromFinding(
    s: string
): "ticketmaster" | "eventbrite" | "dtcm" | "dcul" | "serpapi" | "newsapi" | "manual" | "market_template" | "ai_detected" {
    if (s === "ticketmaster") return "ticketmaster";
    if (s === "eventbrite") return "eventbrite";
    if (s === "dtcm") return "dtcm";
    if (s === "dcul") return "dcul";
    if (s === "market_template") return "market_template";
    if (s.startsWith("serpapi")) return "serpapi";
    if (s === "newsapi") return "newsapi";
    if (s === "manual" || s === "public_holiday_calendar") return "manual";
    return "ai_detected";
}

export function benchmarkCoversWindow(
    benchmark: { dateFrom: string; dateTo: string } | null | undefined,
    dateFrom: string,
    dateTo: string
): boolean {
    if (!benchmark) return false;
    return benchmark.dateFrom <= dateFrom && benchmark.dateTo >= dateTo;
}

export interface RefreshAssessment {
    needsRefresh: boolean;
    reason: string;
    verifiedEventCount: number;
    benchmarkCovers: boolean;
    newestVerifiedAt: string | null;
}

/** Decide whether to re-fetch SERP/News for this listing + date window. */
export async function assessMarketIntelRefresh(opts: {
    orgId: mongoose.Types.ObjectId;
    listingId: mongoose.Types.ObjectId;
    dateFrom: string;
    dateTo: string;
    maxAgeDays?: number;
}): Promise<RefreshAssessment> {
    const { orgId, listingId, dateFrom, dateTo, maxAgeDays = DEFAULT_MAX_AGE_DAYS } = opts;
    await connectDB();

    const eventFilter = {
        orgId,
        $or: [{ listingId }, { listingId: { $exists: false } }, { listingId: null }],
        startDate: { $lte: dateTo },
        endDate: { $gte: dateFrom },
        isActive: true,
        source: { $in: [...VERIFIED_EVENT_SOURCES] },
    };

    const [verifiedEventCount, newestVerified, benchmark] = await Promise.all([
        MarketEvent.countDocuments(eventFilter),
        MarketEvent.findOne(eventFilter).sort({ updatedAt: -1 }).select("updatedAt").lean(),
        BenchmarkData.findOne({
            orgId,
            listingId,
            dateFrom: { $lte: dateFrom },
            dateTo: { $gte: dateTo },
        })
            .sort({ updatedAt: -1 })
            .select("dateFrom dateTo updatedAt")
            .lean(),
    ]);

    const benchmarkCovers = benchmarkCoversWindow(benchmark, dateFrom, dateTo);
    const newestVerifiedAt = newestVerified?.updatedAt?.toISOString() ?? null;

    let stale = false;
    if (newestVerified?.updatedAt) {
        const ageMs = Date.now() - newestVerified.updatedAt.getTime();
        stale = ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
    }

    if (verifiedEventCount === 0) {
        return {
            needsRefresh: true,
            reason: "no verified events overlap this window",
            verifiedEventCount,
            benchmarkCovers,
            newestVerifiedAt,
        };
    }
    if (!benchmarkCovers) {
        return {
            needsRefresh: true,
            reason: "benchmark does not cover the full query window",
            verifiedEventCount,
            benchmarkCovers,
            newestVerifiedAt,
        };
    }
    if (stale) {
        return {
            needsRefresh: true,
            reason: `verified events older than ${maxAgeDays} days`,
            verifiedEventCount,
            benchmarkCovers,
            newestVerifiedAt,
        };
    }

    return {
        needsRefresh: false,
        reason: "cached verified intel covers window",
        verifiedEventCount,
        benchmarkCovers,
        newestVerifiedAt,
    };
}

export interface UpsertIntelResult {
    saved: number;
    verifiedCount: number;
    sourceBreakdown: Record<string, SourceBreakdownEntry>;
    sourcesUsed: string[];
}

/** Persist verified aggregator findings — shared by market-setup and chat refresh. */
export async function upsertVerifiedFindings(opts: {
    orgId: mongoose.Types.ObjectId;
    listingId: mongoose.Types.ObjectId;
    area: string;
    findings: IntelFinding[];
}): Promise<number> {
    const { orgId, listingId, area, findings } = opts;
    if (findings.length === 0) return 0;

    const docs = findings.map((f) => ({
        orgId,
        listingId,
        name: f.title,
        startDate: f.dateStart,
        endDate: f.dateEnd,
        area,
        impactLevel: f.impact,
        upliftPct: f.suggestedPremiumPct,
        confidence: Math.round((f.confidence ?? 0.75) * 100),
        description: `[${f.type}] ${f.description}${f.url ? ` (${f.url})` : ""}`,
        source: sourceTagFromFinding(f.source),
        isActive: true,
    }));

    const bulkOps = docs.map((f) => ({
        updateOne: {
            filter: { orgId: f.orgId, listingId: f.listingId, name: f.name, startDate: f.startDate },
            update: { $set: f },
            upsert: true,
        },
    }));

    const res = await MarketEvent.bulkWrite(bulkOps);
    return res.upsertedCount + res.modifiedCount;
}

/**
 * Fetch SERP/News/Ticketmaster for the window and upsert if refresh is needed.
 * Returns metadata for logging; does not call Lyzr.
 */
export async function ensureVerifiedMarketIntel(opts: {
    orgId: mongoose.Types.ObjectId;
    listingId: mongoose.Types.ObjectId;
    city: string;
    area?: string;
    countryCode?: string;
    dateFrom: string;
    dateTo: string;
    force?: boolean;
}): Promise<{
    refreshed: boolean;
    assessment: RefreshAssessment;
    upsert: UpsertIntelResult | null;
}> {
    const { orgId, listingId, city, area, countryCode, dateFrom, dateTo, force } = opts;
    const locationArea = area && area !== city ? area : city;

    const assessment = await assessMarketIntelRefresh({ orgId, listingId, dateFrom, dateTo });
    if (!force && !assessment.needsRefresh) {
        return { refreshed: false, assessment, upsert: null };
    }

    console.log(
        `🔄 [MarketIntel] Refreshing verified feeds for ${locationArea} (${dateFrom}→${dateTo}): ${assessment.reason}`
    );

    const dtcm = await resolveDtcmEligibility(orgId);

    const intel = await gatherMarketIntelligence({
        city,
        area: area && area !== city ? area : undefined,
        countryCode,
        dateFrom,
        dateTo,
        enableDtcm: dtcm.enabled,
    });

    if (dtcm.enabled) {
        console.log(`   DTCM: ${dtcm.reason}`);
    }

    console.log(`   Source breakdown:`, JSON.stringify(intel.sourceBreakdown));
    if (intel.sourceErrors.length) {
        console.log(`   Errors:`, intel.sourceErrors.map((e) => `${e.source}: ${e.error}`).join("; "));
    }

    const saved = await upsertVerifiedFindings({
        orgId,
        listingId,
        area: locationArea,
        findings: intel.findings,
    });

    if (intel.findings.length > 0) {
        const archived = await MarketEvent.updateMany(
            {
                orgId,
                listingId,
                source: "ai_detected",
                startDate: { $lte: dateTo },
                endDate: { $gte: dateFrom },
                isActive: true,
            },
            { $set: { isActive: false } }
        );
        if (archived.modifiedCount > 0) {
            console.log(`   Archived ${archived.modifiedCount} stale ai_detected events`);
        }
    }

    const upsert: UpsertIntelResult = {
        saved,
        verifiedCount: intel.findings.length,
        sourceBreakdown: intel.sourceBreakdown,
        sourcesUsed: intel.sourcesUsed,
    };

    return { refreshed: true, assessment, upsert };
}