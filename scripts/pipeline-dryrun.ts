/**
 * Pipeline dry-run - executes the REAL pricing engine code (waterfall.ts)
 * over a full 365-day year, with the same step structure as
 * src/lib/engine/pipeline.ts, and validates engine invariants.
 *
 * No DB or external APIs needed: booking state is synthesized the same way
 * pipeline.ts builds its bookingMap from InventoryMaster.
 *
 * Run:  npx tsx scripts/pipeline-dryrun.ts
 */

import { computeDay, type ListingConfig, type Rule, type BookingContext, type DayResult } from "../src/lib/engine/waterfall";

// ── Step 1: Listing config (mirrors pipeline.ts:loadConfig defaults) ──────────

const config: ListingConfig = {
    basePrice: 500,
    absoluteMinPrice: 300,   // floor
    absoluteMaxPrice: 1200,  // ceiling
    defaultMinStay: 1,
    defaultMaxStay: 30,
    lowestMinStayAllowed: 1,
    allowedCheckinDays: [1, 1, 1, 1, 1, 1, 1],
    allowedCheckoutDays: [1, 1, 1, 1, 1, 1, 1],

    lastMinuteEnabled: true,
    lastMinuteDaysOut: 7,
    lastMinuteDiscountPct: 15,
    lastMinuteMinStay: 1,

    farOutEnabled: true,
    farOutDaysOut: 120,
    farOutMarkupPct: 10,
    farOutMinStay: null,

    dowPricingEnabled: true,
    dowDays: [4, 5],         // Fri, Sat (0=Mon)
    dowPriceAdjPct: 20,
    dowMinStay: null,

    gapPreventionEnabled: true,
    minFragmentThreshold: 2,

    gapFillEnabled: true,
    gapFillLengthMin: 2,
    gapFillLengthMax: 4,
    gapFillDiscountPct: 12,
    gapFillOverrideCico: true,
};

// ── Step 2: Pricing rules (SEASON + EVENT, as PricingRule rows would load) ────

const today = new Date();
today.setHours(0, 0, 0, 0);
const iso = (d: Date) => d.toISOString().split("T")[0];
const plus = (days: number) => { const d = new Date(today); d.setDate(d.getDate() + days); return d; };

const rules: Rule[] = [
    {
        id: "season-peak", ruleType: "SEASON", name: "Peak Season +25%", enabled: true, priority: 10,
        startDate: iso(plus(150)), endDate: iso(plus(210)), daysOfWeek: null, minNights: null,
        priceOverride: null, priceAdjPct: 25, minPriceOverride: null, maxPriceOverride: null,
        minStayOverride: 2, isBlocked: false, closedToArrival: false, closedToDeparture: false,
        suspendLastMinute: false, suspendGapFill: false,
    },
    {
        id: "event-expo", ruleType: "EVENT", name: "City Expo +40%", enabled: true, priority: 20,
        startDate: iso(plus(60)), endDate: iso(plus(64)), daysOfWeek: null, minNights: null,
        priceOverride: null, priceAdjPct: 40, minPriceOverride: null, maxPriceOverride: null,
        minStayOverride: 3, isBlocked: false, closedToArrival: false, closedToDeparture: false,
        suspendLastMinute: true, suspendGapFill: true,
    },
    {
        id: "admin-block", ruleType: "ADMIN_BLOCK", name: "Owner stay", enabled: true, priority: 30,
        startDate: iso(plus(30)), endDate: iso(plus(32)), daysOfWeek: null, minNights: null,
        priceOverride: null, priceAdjPct: null, minPriceOverride: null, maxPriceOverride: null,
        minStayOverride: null, isBlocked: true, closedToArrival: false, closedToDeparture: false,
        suspendLastMinute: false, suspendGapFill: false,
    },
    {
        id: "los-week", ruleType: "LOS_DISCOUNT", name: "Weekly -10%", enabled: true, priority: 5,
        startDate: null, endDate: null, daysOfWeek: null, minNights: 7,
        priceOverride: null, priceAdjPct: -10, minPriceOverride: null, maxPriceOverride: null,
        minStayOverride: null, isBlocked: false, closedToArrival: false, closedToDeparture: false,
        suspendLastMinute: false, suspendGapFill: false,
    },
];

// ── Step 3: Booking state (as pipeline.ts builds bookingMap + gap detection) ──

// Bookings: days 10-14 and 18-25 booked → 3-day gap (15,16,17) between them.
const bookedDays = new Set<number>();
for (let d = 10; d <= 14; d++) bookedDays.add(d);
for (let d = 18; d <= 25; d++) bookedDays.add(d);
// Another pair creating a 1-day fragment at day 41 (gap prevention should block it).
for (let d = 38; d <= 40; d++) bookedDays.add(d);
for (let d = 42; d <= 45; d++) bookedDays.add(d);

/** Same gap semantics as pipeline.ts: a free run bounded by bookings on both sides. */
function bookingCtxFor(offset: number): BookingContext {
    if (bookedDays.has(offset)) return { isBooked: true, gapLength: null, gapStart: null, gapEnd: null };
    let start = offset;
    while (start - 1 >= 0 && !bookedDays.has(start - 1)) start--;
    let end = offset;
    while (end + 1 <= 365 && !bookedDays.has(end + 1)) end++;
    const boundedLeft = start - 1 >= 0 && bookedDays.has(start - 1);
    const boundedRight = end + 1 <= 365 && bookedDays.has(end + 1);
    if (boundedLeft && boundedRight) {
        return { isBooked: false, gapLength: end - start + 1, gapStart: iso(plus(start)), gapEnd: iso(plus(end)) };
    }
    return { isBooked: false, gapLength: null, gapStart: null, gapEnd: null };
}

// ── Step 4: Run the engine for 365 days (real computeDay) ─────────────────────

interface TraceRow { offset: number; date: string; result: DayResult; }
const results: TraceRow[] = [];
for (let offset = 0; offset < 365; offset++) {
    const date = plus(offset);
    results.push({ offset, date: iso(date), result: computeDay(date, today, config, rules, bookingCtxFor(offset)) });
}

// ── Step 5: Validate invariants ────────────────────────────────────────────────

const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
    console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` - ${detail}` : ""}`);
    if (!ok) failures.push(name);
};

console.log("\n══════════ PIPELINE DRY-RUN - 365-day waterfall execution ══════════\n");
console.log(`Base ${config.basePrice} | floor ${config.absoluteMinPrice} | ceiling ${config.absoluteMaxPrice} | today ${iso(today)}\n`);

console.log("── Sample day traces (each waterfall pass visible in note) ──");
const sample = [2, 6, 16, 30, 41, 61, 100, 160, 200, 364];
for (const o of sample) {
    const r = results[o];
    console.log(`\n  Day +${o} (${r.date}) → price=${r.result.price} minStay=${r.result.minimumStay} avail=${r.result.isAvailable}`);
    console.log(`    ${r.result.note || "(base price, no adjustments)"}`);
}

console.log("\n── Invariant validation ──");

const available = results.filter((r) => r.result.isAvailable === 1);
check("All available-day prices within [floor, ceiling]",
    available.every((r) => r.result.price >= config.absoluteMinPrice && r.result.price <= config.absoluteMaxPrice),
    `${available.length} days checked`);

const lastMinuteDays = results.filter((r) => r.offset <= 7 && r.result.isAvailable === 1);
check("Last-minute discount applied within 7-day window",
    lastMinuteDays.every((r) => r.result.note.includes("LAST_MINUTE")),
    `${lastMinuteDays.length} days`);

const farOutDays = results.filter((r) => r.offset >= 120 && r.result.isAvailable === 1);
check("Far-out premium applied beyond 120 days",
    farOutDays.every((r) => r.result.note.includes("FAR_OUT")),
    `${farOutDays.length} days`);

const gapDays = results.filter((r) => [15, 16, 17].includes(r.offset));
check("3-day gap gets gap-fill discount + minStay=gap length",
    gapDays.every((r) => r.result.note.includes("GAP_FILL") && r.result.minimumStay === 3),
    gapDays.map((r) => `+${r.offset}:${r.result.price}`).join(" "));

const fragment = results[41];
check("1-day fragment blocked by gap prevention",
    fragment.result.isAvailable === 0 && fragment.result.note.includes("GAP_PREVENTION"));

const eventDays = results.filter((r) => r.offset >= 60 && r.offset <= 64);
check("EVENT rule (+40%, minStay 3, suspends LM/gap-fill) applied",
    eventDays.every((r) => r.result.note.includes("City Expo") && r.result.minimumStay === 3));

const seasonDays = results.filter((r) => r.offset >= 150 && r.offset <= 210 && r.result.isAvailable === 1);
check("SEASON rule (+25%) applied across window",
    seasonDays.every((r) => r.result.note.includes("Peak Season")),
    `${seasonDays.length} days`);

const blockedDays = results.filter((r) => [30, 31, 32].includes(r.offset));
check("ADMIN_BLOCK days unavailable",
    blockedDays.every((r) => r.result.isAvailable === 0));

const booked = results.filter((r) => bookedDays.has(r.offset));
check("Booked days marked unavailable",
    booked.every((r) => r.result.isAvailable === 0),
    `${booked.length} days`);

// DOW pricing: weekend days (Fri/Sat) outside other adjustments
const dowApplied = results.filter((r) => r.result.note.includes("[DOW]"));
check("DOW weekend pricing fires", dowApplied.length > 90, `${dowApplied.length} weekend days adjusted`);

// Ceiling stress: far-out + season + weekend stacks - must clamp, not exceed
const stacked = results.filter((r) => r.result.note.includes("FAR_OUT") && r.result.note.includes("Peak Season") && r.result.note.includes("[DOW]"));
check("Stacked multipliers clamp at ceiling (never exceed)",
    stacked.every((r) => r.result.price <= config.absoluteMaxPrice),
    `${stacked.length} stacked days, max seen: ${Math.max(...stacked.map((r) => r.result.price))}`);

// ── Step 6: Year-shape summary (validates full-year dynamic pricing) ──────────

console.log("\n── 365-day price shape (monthly averages, available days) ──");
const byMonth = new Map<string, number[]>();
for (const r of available) {
    const m = r.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(r.result.price);
}
for (const [m, prices] of byMonth) {
    const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
    const bar = "█".repeat(Math.round(avg / 25));
    console.log(`  ${m}  avg ${String(avg).padStart(4)}  ${bar}`);
}

console.log(`\n${failures.length === 0 ? "🎉 ALL INVARIANTS PASSED" : `❌ ${failures.length} FAILURES: ${failures.join(", ")}`}`);
process.exit(failures.length === 0 ? 0 : 1);
