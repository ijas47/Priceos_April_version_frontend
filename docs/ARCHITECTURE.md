# PriceOS — System Architecture (Current State)

> **Canonical, code-accurate architecture reference.** This document supersedes
> the older architecture decks/notes where they conflict. It reflects the
> system as actually implemented in `src/`.
>
> Companion docs: `PriceOS-Product-Playbook.md` (sales/positioning),
> `database_schema_documentation.md` (data model), `CHANGELOG.md` (what changed).

---

## 1. What PriceOS is

An AI revenue-management platform for Dubai short-term-rental operators. It
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
`proposalStatus="pending"`), and logs an `EngineRun` audit row.

### Layer A — deterministic 4-pass waterfall
`computeDay()` in `src/lib/engine/waterfall.ts`:
1. **Market anchor** — seasonality (month vs annual market median, capped
   0.5×–2.0×) and forward-occupancy demand, from Airbtics signals.
2. **Foundation** — operator seasonal/event/admin rules (`PricingRule`).
3. **Strategy** — last-minute discounts, far-out premiums, day-of-week pricing.
4. **Inventory** — gap-fill for 1–2 night gaps between bookings.
5. **Integrity** — clamp to floor/ceiling, enforce min-stay, round to 2dp.

### Layer B — revenue optimization (elasticity + demand) — **live**
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

### Guardrails (always)
Floor/ceiling clamp + ±25% shift cap + per-rule price overrides. The optimizer
can never escape a listing's floor/ceiling.

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
