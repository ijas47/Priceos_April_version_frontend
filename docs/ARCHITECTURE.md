# PriceOS — System Architecture (Current State)

> **Canonical, code-accurate architecture reference.** This document supersedes
> the older architecture decks/notes where they conflict. It reflects the
> system as actually implemented in `src/`.
>
> Companion docs: `PriceOS-Product-Playbook.md` (sales/positioning),
> `database_schema_documentation.md` (data model), `CHANGELOG.md` (what changed).

---

## 1. What PriceOS is

An AI revenue-management platform for short-term-rental operators. It
aggregates market/booking/event signals, runs a pricing engine that produces
per-night **price proposals**, lets a human approve them, and (when explicitly
enabled) syncs approved prices to the PMS. It also provides a guest-messaging
inbox with AI-drafted replies.

## 2. Tech stack (authoritative)

| Layer | Technology |
|------|-----------|
| Framework | Next.js 15 (App Router), React 19 |
| Language | TypeScript |
| Database | MongoDB via Mongoose ODM |
| Auth | Custom JWT (HS256) in httpOnly cookies |
| Edge auth | `jose` (signature verification in middleware) |
| AI orchestration | Lyzr manager–worker agents |
| Market data | Airbtics |
| PMS | Hostaway (abstracted `PMSClient`) |
| UI | shadcn/ui + Radix + Tailwind v4 |
| State | Zustand |
| Hosting | Vercel (app) + MongoDB Atlas/DocumentDB |
| Tests/CI | Vitest + GitHub Actions |

> There is **no** Postgres/Drizzle/Neon in the codebase. Older docs that mention
> them are historical.

## 3. High-level shape

```
Browser ──▶ middleware.ts (verifies JWT signature, gates routes)
        ──▶ src/app/api/**/route.ts  (109 routes; auth + orgId scoping)
                 │
                 ├─▶ src/lib/auth/*        (JWT issue/verify, getSession)
                 ├─▶ src/lib/db/*          (Mongoose connection + 18 models)
                 ├─▶ src/lib/engine/*      (pricing pipeline + waterfall + optimization)
                 ├─▶ src/lib/elasticity/*  (booking-probability model)
                 ├─▶ src/lib/demand/*      (source-market demand modifiers)
                 ├─▶ src/lib/agents/*      (Lyzr proxy, channel-sync, research)
                 ├─▶ src/lib/airbtics/*    (market context)
                 └─▶ src/lib/hostaway/*    (PMS client — read-only by default)
```

The app lives at the **repo root** (`src/…`). Pages: `src/app/(dashboard)/*`
(dashboard, properties, calendar, reservations, pricing, proposals, market,
agent-chat, guest inbox, operations, analytics, backtest, groups, settings,
users). API: `src/app/api/*`.

## 4. Security & multi-tenancy

- **Tenancy:** every customer is an "organization" (`orgId`). Data-bearing models
  carry `orgId`; API routes authenticate and **scope every query by `orgId`**.
- **Auth issuance:** `src/lib/auth/jwt.ts` signs HS256 access (7d) + refresh
  (30d) tokens; secrets from `JWT_SECRET` / `JWT_REFRESH_SECRET` (fail-closed in
  production).
- **Edge enforcement:** `src/middleware.ts` **verifies the JWT signature** with
  `jose` (algorithm pinned to HS256 to block `alg=none`/confusion forgery) and
  gates page/API access. (Previously it only decoded the token — now fixed.)
- **Route authorization:** handlers call `getSession()` /
  `requireScopedSession()` and filter by `orgId` (e.g. `db-viewer`,
  `proposals/[id]/approve`, `v1/properties`, `chat/history`,
  `listings/[id]/*`, `v1/guests/*`).
- **Secrets:** environment variables only; CI runs `scripts/check-secrets.sh`
  to fail on any committed credential. See `../SECURITY.md` for rotation.

## 5. The pricing engine (core)

Entry point: `runPipeline(listingId)` in `src/lib/engine/pipeline.ts`. For each
listing it computes the next **365 days** and writes proposals into the
`InventoryMaster` collection (`proposedPrice`, `changePct`, `reasoning`,
`proposalStatus`), and logs an `EngineRun` audit row.

**On every run** the engine re-reads `Organization.pricingStrategy` and
`Organization.settings.guardrails` — strategy is not a one-time setup snapshot.

### Layer 0 — month-first market anchor (seasonal base)
`resolveMarketAnchorBase()` in `src/lib/pricing/market-anchor.ts` with dynamic
weights from `src/lib/pricing/anchor-weights.ts`:

| Mode | When | Weights (approx.) |
|------|------|-------------------|
| **month_first** | Monthly market ADR available (Dubai `DubaiMarketMonthly`, Airbtics monthly) | 50% month p50, 20% month comp p50, 15% pacing, 10% annual, 5% listed Hostaway ref |
| **market_blend** | Partial market data | Legacy blend; listed price weighs more |
| **listed_only** | No market data | 100% Hostaway calendar / listing price |

Per-day comp percentiles are **month-specific** (not a single TTM median for all
365 days). This is what enables Dubai-style seasonal swings (e.g. summer p25 vs
winter p75) without stacking conflicting `%` seasonal rules.

**Unified seasonality:** the UAE PriceLabs calendar switches **tactical profiles**
(occupancy matrix, last-minute ramps, MLOS) per date segment. Legacy
`[UAE]`/`[Auto]` `SEASON` `priceAdjPct` rules are **not** applied when
month-first anchor is active — they are filtered out of the engine and removed
on `applyPricingPackToOrg()`.

### Layer A — deterministic 4-pass waterfall
`computeDay()` in `src/lib/engine/waterfall.ts`:
1. **Market anchor** — month-first blend + forward-occupancy demand + booking
   pace vs STLY.
2. **Foundation** — operator event/admin rules and **manual** `SEASON` rules
   (auto-generated `%` season rules removed).
3. **Strategy** — last-minute, far-out, DOW, occupancy matrix (from active
   seasonal **profile** + live `pricingStrategy` preset).
4. **Inventory** — gap-fill / gap-prevention between bookings.
5. **Integrity** — clamp to per-day floor/ceiling band, enforce min-stay.

**Per-day guardrail band:** `resolveMonthlyGuardrailBand()` sets floor/ceiling
from month market p25/p75 × strategy `floorMult`/`ceilingMult` (Conservative /
Balanced / Aggressive), then `resolveDynamicFloor()` may raise the floor via
STLY safety and comp p25 guards.

### Layer B — events, elasticity, org guardrails
- **Events** — `MarketEvent` rows indexed by date; uplift caps shared with
  `src/lib/pricing/event-pricing.ts` (weight: `Organization.eventPricingWeight`).
- **Revenue optimization (elasticity + demand) — live**
`src/lib/engine/optimization.ts` + `src/lib/elasticity/model.ts` +
`src/lib/demand/modifiers.ts`:
- Fit a **logistic booking-probability model** (IRLS) on the listing's own past
  calendar history; cold-start defaults when data is thin.
- Find the **revenue-maximizing price** (price × P(book)) within the band via
  golden-section search.
- **Confidence-weighted blend** with the rulebook price (weight =
  min(sampleSize, 30)/30), so no/low history ⇒ output ≈ rulebook.
- Apply a **bounded source-market demand modifier** (±15%).
- **Cap total movement to ±25%** of the rulebook price, then **hard-clamp to
  floor/ceiling**.
- Gated by `ELASTICITY_PRICING` (default **on**; set `off` for shadow mode).
  Each day records `elasticityPrice` / `elasticityWeight` / `pBook` for the
  rulebook-vs-optimized comparison shown on the Pricing page.

### Layer C — proposal guardrails (enforced)
`applyProposalGuardrails()` in `src/lib/pricing/proposal-guardrails.ts`:
- Caps each proposal vs **current Hostaway calendar price** by
  `settings.guardrails.maxSingleDayChangePct` (from strategy preset).
- Sets `proposalStatus="approved"` when `|changePct| ≤ autoApproveThreshold`.
- Larger moves stay `pending` for human review (or bulk approve in UI).

### Guardrails (always)
Month band floor/ceiling + elasticity ±25% shift cap + per-rule overrides + daily
change cap. The optimizer cannot escape the effective per-day band.

### Strategy presets (Conservative / Balanced / Aggressive)
Defined in `src/lib/pricing/strategy-presets.ts`. These are **risk posture**
knobs re-applied every engine run via `applyStrategyPresetToConfig()`:

| Preset | Floor×market p25 | Ceiling×market p75 | LM discount | Auto-approve under |
|--------|------------------|--------------------|-------------|--------------------|
| Conservative | 0.7× | 1.8× | 10% | 3% |
| Balanced | 0.5× | 2.5× | 15% | 5% |
| Aggressive | 0.4× | 3.5× | 25% | 10% |

Apply via `POST /api/pricing/portfolio-setup` or onboarding; engine picks up
changes on the next `runPipeline` without re-running setup.

## 6. Agents (Lyzr manager–worker)

- **Aria (CRO Router)** — the conversational manager; orchestrates workers,
  answers the operator, presents proposals. On the user's **first message** for a
  property + date range it **auto-primes** (market scan + benchmark + guardrail
  setup) — there is no separate "Run Aria" activation step anymore.
- **Workers:** Property Analyst, Booking Intelligence, Market/Internet Research,
  Competitor Benchmark, PriceGuard/Guardrails, Marketing, Conversation Summary,
  Chat Response. Agent IDs are configured via env (`LYZR_*_AGENT_ID`).
- **Constraints:** only Aria talks to the user; only the channel-sync path writes
  to the PMS; workers never execute autonomously.
- **Pricing engine:** does **not** call Lyzr. Event uplifts use cached
  `MarketEvent` documents + shared `event-pricing.ts` (same caps as
  `EventIntelligenceAgent.getPricingRecommendation`).
- **Resilience:** the Lyzr proxy (`src/lib/agents/ai-agent.ts`) has a 60s
  timeout; the chat route runs as a polled background job.

## 7. PMS integration & execution safety

- `PMSClient` factory (`src/lib/pms/index.ts`) with `mock` | `db` | `live`
  (`HOSTAWAY_MODE`).
- **Execution is read-only by default:** `src/lib/hostaway/client.ts`
  `updateCalendar()` is blocked unless `HOSTAWAY_READ_ONLY=false` (defaults to
  read-only). Guest-message sending is separately gated by
  `HOSTAWAY_ALLOW_GUEST_SEND` (default off). The client also has a 20s request
  timeout and bounded 429 retries.
- Approval flow: `POST /api/proposals/[id]/approve` (auth + orgId-scoped) →
  `ChannelSyncAgent.executeProposal` → `updateCalendar()` (blocked in read-only).
- Inbound: `/api/webhooks/hostaway` (secret-verified, fail-closed) ingests guest
  conversations.

## 8. State machine

`Connected → Observing → Simulating → Active → Paused`. Execution is only
possible in **Active**; **Paused** requires explicit human action to resume.
Nothing auto-executes; proposals require human approval.

## 9. Reliability & quality

- **Tests** (`*.test.ts`, Vitest): pricing floor/ceiling invariant, optimizer
  guardrail safety, JWT forgery rejection, elasticity guards.
- **CI** (`.github/workflows/ci.yml`): secret-scan → lint → typecheck → test →
  build, on push/PR to `main`/`dev`. Lint and typecheck are blocking.
- **External calls** (Lyzr/Hostaway/Airbtics) use timeouts and bounded retries;
  missing market data degrades to base pricing rather than failing.

## 10. Documentation status

| Doc | Status |
|-----|--------|
| `ARCHITECTURE.md` (this) | ✅ Canonical, current |
| `PriceOS-Product-Playbook.md` | ✅ Current (sales/positioning) |
| `database_schema_documentation.md` | ✅ Updated to MongoDB |
| `../CLAUDE.md` | ✅ Current (with authoritative stack note) |
| `../SECURITY.md` | ✅ Current (secret rotation runbook) |
| `../CHANGELOG.md` | ✅ Current |
| `architecture_documentation.md`, `dashboard-architecture-data-flow.md`, `agent-call-reference.md` | ⚠️ Mostly current data-flow detail; defer to this doc on stack/security/pricing |
| `decks/*`, `notes/*` | 🗄️ Historical presentation/scratch artifacts; superseded by this doc where they conflict |
