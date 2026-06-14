# PriceOS — AI Revenue Manager for Holiday Homes

**Founder:** Ijas Abdulla (ijas47@gmail.com)

**Stack:** Next.js 15 (App Router) · MongoDB/Mongoose · custom JWT auth · Lyzr
agents · Hostaway (read-only by default) · Vercel.

**Key docs:**
[Architecture](docs/ARCHITECTURE.md) ·
[Product & Sales Playbook](docs/PriceOS-Product-Playbook.md) ·
[Database schema](docs/database_schema_documentation.md) ·
[Security & secret rotation](SECURITY.md) ·
[Changelog](CHANGELOG.md) ·
[Contributor guide](CLAUDE.md)

---

> **Positioning:** PriceOS is a **global, market-agnostic** revenue platform.
> The UAE is the **launch market** (V1) — the engine, market templates, and PMS
> integration are parameterized per market, not tied to any single geography.
> The path to scale is the Hostaway (and other PMS) marketplace, post first
> live client.

## The Market

The short-term rental market moves fast and punishes slow operators.

**The value chain:**

```
Owner → Property Manager (solo / agency) → Channels (Airbnb, Booking.com, VRBO) → Guest
```

Property managers (PMs) sit at the center — they control pricing, availability, and revenue for owners who expect results. A typical PM manages **15–50+ units** across multiple OTA channels, each with its own calendar, pricing rules, and booking patterns.

### Why UAE first (launch market)

- **25,000+ active STR listings** — 3x growth from ~9K in 2022
- **22M+ international visitors/year** — diverse demand from Europe, GCC, South Asia, CIS
- **Extreme seasonality** — 2.5–3x price swings between peak (Nov–Apr) and summer
- **Event-driven spikes** — Dubai Shopping Festival, F1, Ramadan/Eid, Art Dubai, GITEX
- **Short booking windows** — ~65% of bookings happen within 10 days of check-in
- **Thu–Fri weekends** — different demand rhythm than Western markets
- **Tourism Dirham** — regulatory layer that adds per-night fees by property class

### How PMs Price Today

PMs juggle a mix of:
- **PMS dashboards** (Guesty, Hostaway, Hostify, mr.alfred) for calendars and reservations
- **Pricing tools** (PriceLabs, Beyond Pricing, Wheelhouse) for rate suggestions
- **Spreadsheets** for tracking seasonal patterns and owner floors
- **WhatsApp groups** for competitor intel and market chatter
- **Gut feel** refined over years of local experience

The existing pricing tools are **global-first, not market-native**. They optimize for algorithm breadth across 100+ markets, not depth in one. None of them own execution — they suggest a price, and the PM still has to decide, push, verify, and fix.

---

## The Problem

The real problem isn't pricing. It's **decision fatigue at scale**.

A PM managing 40 units across 3 channels faces hundreds of micro-decisions daily:
- Which units need a price change today?
- Is this gap an orphan night or a demand signal?
- Did the competitor drop rates because of low demand or a pricing error?
- Did last night's price push actually go through on all channels?
- Should I react to DSF starting next week, or has the market already priced it in?

These decisions are **scattered** — across PMS dashboards, pricing tool outputs, spreadsheets, chat threads, and memory. There's no single place to see **what happened, why, and what to do next**.

The result:
- **Stale pricing** — rates sit unchanged while the market moves
- **Missed gaps** — orphan nights and short gaps bleed revenue
- **Slow event response** — by the time the PM reacts, competitors have already moved
- **No execution accountability** — a price was "set" but never verified on the channel
- **Revenue leakage** — not from bad strategy, but from incomplete execution

Existing tools give PMs more data and more suggestions. What PMs actually need is **fewer decisions and more confidence that those decisions were carried out**.

---

## The Solution

PriceOS is a **centralized decision board** for property managers.

Instead of scattering decisions across tools and tabs, PriceOS aggregates all signals into one view, proposes actions with explanations, executes approved changes through the PMS, verifies outcomes, and rolls back on failure.

**One place to see. Decide. Act. Verify.**

| Capability | What It Does |
|-----------|-------------|
| **Aggregate** | Pulls calendars, prices, bookings, events, and competitor data into a single view |
| **Propose** | Classifies each date, identifies actions needed, explains the reasoning |
| **Execute** | Pushes approved changes to PMS channels |
| **Verify** | Confirms changes landed correctly, flags mismatches |
| **Rollback** | Automatically reverts failed or anomalous changes |
| **Learn** | Tracks outcomes to improve future proposals |

**V1 rule: The system never acts silently.** Human approval is always in the loop.

---

## Target Users

| Role | Access |
|------|--------|
| Admin | Configure system, approve execution, pause automation |
| Revenue Manager | Review proposals, approve actions |
| Ops | View activity, manage reservations |
| Read-only | Audit and visibility only |

**ICP:** Property managers running 15–50 units, revenue management agencies, in-house revenue managers — UAE-based for the V1 launch market (the product is market-agnostic and expands globally).

## Initial Market

**UAE (launch market)** — short-term holiday rentals, launching during high season (Nov–Apr).

High season provides maximum signal density: events stack up, demand swings are sharp, and the cost of stale pricing is highest. If PriceOS proves value here, quieter months and other markets follow naturally.

## V1 Scope

### In Scope
- Daily pricing execution across connected channels
- Gap and length-of-stay optimization
- Conservative event-aware pricing (DSF, F1, Ramadan, Eid)
- Competitor compression awareness
- PMS execution with verification and rollback
- CRO chat as primary interface
- Approval workflows for medium/high-risk changes
- Reservation handling via PMS inbox

### Out of Scope (V1)
- Strategy design or long-term planning
- Fully autonomous pricing (no human approval)
- Portfolio-level optimization across owners
- Owner-facing analytics or reporting
- Listing content optimization
- Aggressive multi-market rollout (the architecture supports it; UAE is the V1 operational focus)

---

## System States

| State | Execution | Description |
|-------|-----------|-------------|
| Connected | Not allowed | PMS linked, no data flow |
| Observing | Not allowed | Read-only monitoring |
| Simulating | Not allowed | Proposals generated, not executed |
| **Active** | **Allowed** | Execution enabled with approval |
| Paused | Not allowed | Hard stop, all execution halted |

- Execution ONLY in Active state
- State transitions require explicit human action
- Any anomaly forces immediate Paused state
- Resuming from Paused requires deliberate human intent

## Architecture

### Manager Agent: CRO (Chief Revenue Officer)

Single authority for orchestration, user interaction, approvals, execution triggers, explanations, and state transitions. The CRO is the PM's interface to PriceOS — it speaks in business terms, not technical ones.

### Worker Agents (9)

| # | Agent | Role | Key Constraint |
|---|-------|------|----------------|
| 1 | Data Aggregator | Pulls calendars, prices, bookings, LOS from PMS | Source of truth; flags stale data |
| 2 | Event Intelligence | Monitors local event sources, outputs event signals | Conservative confidence scoring; no pricing decisions |
| 3 | Competitor Scanner | Observes competitor availability and pricing | Detects compression/release; outputs signals only |
| 4 | Pricing Optimizer | Classifies dates, proposes price changes with reasoning | Within owner limits; assigns risk level per change |
| 5 | Gap & LOS Optimizer | Detects orphan nights, short gaps, LOS mismatches | LOS-first fixes; discounts only as last resort |
| 6 | Adjustment Reviewer | Applies guardrails, enforces max change limits | Can veto any proposal deemed unsafe |
| 7 | Channel Sync | Pushes approved changes to PMS channels | Verifies success; stores rollback payloads |
| 8 | Anomaly Detector | Monitors post-execution outcomes for drift | Triggers pause; escalates to CRO |
| 9 | Reservation Agent | Reads PMS inbox, responds to routine booking queries | No pricing authority in V1 |

### Execution Flow

```
1. Data Aggregator    → refreshes PMS data (calendars, prices, bookings)
2. Event Intelligence → updates event signals (market-specific)
3. Competitor Scanner → updates market signals (compression, releases)
4. Pricing Optimizer  → proposes price actions with risk levels
5. Gap & LOS Optimizer → proposes gap fixes and LOS adjustments
6. Adjustment Reviewer → validates all proposals against guardrails
7. CRO               → queues proposals, requests approval where needed
8. Channel Sync      → executes approved actions via PMS
9. Anomaly Detector  → monitors outcomes, flags drift
```

### Approval Rules

**Approval required:** risk = medium/high, change exceeds threshold, event-driven pricing, conflicting rules across units.

**Auto-approved:** low-risk gap fixes, auto-reverts on failure, changes within configured safe bounds.

### Rollback

**Preconditions:** fresh PMS data, state = Active, approval obtained, rollback payload captured before execution.

**Triggers:** execution failure, calendar mismatch post-push, anomaly detection, user-initiated pause.

All rollbacks are automated and verifiable — every change has a return path.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js + shadcn/ui (Vercel) |
| Authentication | Neon Auth |
| Database | Neon Postgres (serverless) |
| AI / Agents | Lyzr Manager-Worker architecture |
| PMS Integration | Hostaway API (POC); Guesty, Channex (V1+); Airbnb, VRBO, Booking.com via channel managers |

## Notifications

| Channel | Purpose |
|---------|---------|
| CRO Chat (primary) | Approval cards, daily summaries, execution history, audit trail |
| WhatsApp / Slack (secondary) | Urgent approvals, execution failures, system pauses only |

No routine chatter on secondary channels. If the PM has to check WhatsApp, something went wrong.

## Success Criteria (V1)

- Prices update correctly and verifiably via PMS
- Rollbacks work reliably on every failure path
- Pauses stop all execution immediately
- Measurable reduction in manual pricing checks per week
- High approval acceptance rate (proposals are relevant)
- Low rollback frequency (proposals are safe)
- System runs daily without babysitting
- Trust is preserved under failure — the PM never loses control

## Founder Goals

- Build MVP, test with a handful of live units
- Manage 50 units from Feb
- Develop V2 (autonomous mode, portfolio optimization) and V3 (multi-city) by end of March

## Getting Started

Navigate to the app directory:

```bash
cd app
```

Install dependencies:

```bash
npm install
```

Configure environment variables in `app/.env.local`:

```bash
# Database (Neon Postgres)
DATABASE_URL=postgresql://...

# Neon Auth
NEON_AUTH_BASE_URL=https://auth.neon.tech
NEON_AUTH_COOKIE_SECRET=$(openssl rand -base64 32)

# PMS Mode
HOSTAWAY_MODE=db  # db | mock | live
```

Initialize database:

```bash
npm run db:push
npm run db:seed
```

Start development server:

```bash
npm run dev
```

Visit http://localhost:3000/auth/sign-in to access the application.

## Authentication

PriceOS uses Neon Auth for secure user authentication:

- **Sign Up/Sign In**: Email-based authentication
- **Session Management**: JWT tokens in HTTP-only cookies
- **Protected Routes**: Automatic redirect for unauthenticated users
- **Account Settings**: User profile and security management

See [Neon Auth Setup Guide](docs/neon-auth-setup.md) for detailed configuration.

---

## Documentation

| Doc | Content |
|-----|---------|
| [architecture.md](architecture.md) | Agent architecture — system layers, worker agents, state machine, mock store |
| [roadmap.md](roadmap.md) | POC roadmap — scope, data model, UI, schema, integrations, timeline, success criteria |
