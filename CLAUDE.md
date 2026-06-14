# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> ⚠️ **AUTHORITATIVE STACK NOTE (read first).** Parts of this document below
> describe an earlier Neon Postgres + Drizzle + Neon Auth design that has been
> **replaced**. The current, actual stack is:
>
> - **Database:** MongoDB (Mongoose ODM) — `MONGODB_URI`. Models live in
>   `src/lib/db/models/`, connection in `src/lib/db/client.ts`.
> - **Auth:** Custom JWT (HS256) in httpOnly cookies — `JWT_SECRET` /
>   `JWT_REFRESH_SECRET`. Issued in `src/lib/auth/jwt.ts`, verified in
>   `src/middleware.ts` and `src/lib/auth/server.ts`.
> - **Framework:** Next.js 15 (App Router). The app lives at the **repo root**
>   (`src/…`), NOT under `priceos/app/`.
> - There is **no Drizzle/Neon** in the codebase. Ignore `db:generate` /
>   `db:migrate` / `db:push` commands below — they do not exist.
> - Multi-tenancy: every tenant ("organization") is isolated by `orgId`.
>   API routes must authenticate (`getSession()` / `requireScopedSession()`)
>   and scope every query by `orgId`.

## Project Overview

**PriceOS** is an AI-powered revenue management system for short-term rental property managers. It aggregates signals (events, competitor data, bookings), proposes pricing actions with risk classification, and executes approved changes through property management systems (PMS).

**Founder:** Ijas Abdulla
**Target:** Property managers running multiple units
**V1 Scope:** Daily pricing execution, gap optimization, event-aware pricing, PMS verification

## Architecture

### Manager-Worker Pattern (Lyzr Framework)

The system follows a hierarchical agent architecture:

- **CRO (Chief Revenue Officer)** - Manager agent that orchestrates all operations, communicates with users, and authorizes execution
- **Worker Agents** - Specialized agents for narrow tasks:
  - Data Aggregator (PMS data ingestion)
  - Event Intelligence (Dubai event monitoring)
  - Competitor Scanner (market signals)
  - Pricing Optimizer (proposal generation)
  - Adjustment Reviewer (guardrails & risk classification)
  - Channel Sync (PMS execution & verification)

**Key Constraints:**
- Only CRO can authorize execution
- Only Channel Sync can write to PMS
- Workers never execute autonomously
- All operations are state-gated (Connected → Observing → Simulating → Active → Paused)

### PMSClient Abstraction

Three-layer architecture for PMS flexibility:

```
Application Code
    ↓
createPMSClient() [Factory]
    ├→ MockPMSClient (development)
    ├→ DBPMSClient (current: Neon Postgres)
    └→ HostawayClient (future: live API)
```

**Environment Variable:** `HOSTAWAY_MODE=mock|db|live`

- `mock` - In-memory mock data (5 Dubai properties)
- `db` - Neon Postgres (current production mode)
- `live` - Hostaway API (not yet implemented)

Only Data Aggregator and Channel Sync interact with PMSClient. All other agents work with normalized data structures.

### Database-First Approach

**Current state:** All data lives in Neon Postgres. The DB is the source of truth.

- **Dev branch:** `DATABASE_URL` points to Neon dev branch (local development)
- **Production:** Separate Neon branch (deployed on Vercel)

Schema matches Hostaway API field names for seamless future integration:
- `bedroomsNumber`, `bathroomsNumber`, `price`, `currencyCode`
- `listingMapId` (reservations), `nights` (reservations)
- PriceOS-specific: `priceFloor`, `priceCeiling`, `area`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router) |
| UI Components | shadcn/ui + Radix UI |
| Styling | Tailwind CSS v4 |
| State Management | Zustand |
| Authentication | Custom JWT (HS256, httpOnly cookies) |
| Database | MongoDB (serverless / Atlas / DocumentDB) |
| ODM | Mongoose |
| Date Handling | date-fns |
| Deployment | Vercel |
| AI Orchestration | Lyzr Manager-Worker |

## Directory Structure

```
priceos/
├── app/                          # Next.js application
│   ├── src/
│   │   ├── app/                  # App Router routes
│   │   │   ├── (dashboard)/      # Protected dashboard routes
│   │   │   │   ├── dashboard/    # Main dashboard
│   │   │   │   ├── properties/   # Property management
│   │   │   │   ├── calendar/     # Calendar view
│   │   │   │   ├── bookings/     # Reservation management
│   │   │   │   ├── pricing/      # AI pricing proposals
│   │   │   │   ├── proposals/    # Proposal review
│   │   │   │   ├── finance/      # Revenue tracking
│   │   │   │   ├── inbox/        # Guest messaging
│   │   │   │   ├── tasks/        # Task management
│   │   │   │   ├── insights/     # Analytics
│   │   │   │   └── settings/     # Configuration
│   │   │   ├── api/              # API routes
│   │   │   │   ├── agent/        # AI agent endpoints
│   │   │   │   ├── listings/     # Property CRUD
│   │   │   │   ├── calendar/     # Calendar operations
│   │   │   │   ├── reservations/ # Booking CRUD
│   │   │   │   └── ...
│   │   │   └── auth/             # Authentication
│   │   ├── components/           # React components
│   │   │   ├── ui/               # shadcn UI primitives
│   │   │   └── ...               # Feature components
│   │   ├── lib/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts     # Drizzle schema (10 tables)
│   │   │   │   ├── client.ts     # Database client
│   │   │   │   └── seed.ts       # Seed data script
│   │   │   ├── pms/              # PMS abstraction layer
│   │   │   │   ├── types.ts      # PMSClient interface
│   │   │   │   ├── mock-client.ts
│   │   │   │   ├── db-client.ts  # Current: Neon DB client
│   │   │   │   ├── hostaway-client.ts
│   │   │   │   └── index.ts      # Factory
│   │   │   ├── agents/           # AI agents
│   │   │   │   ├── types.ts
│   │   │   │   ├── mock-agents.ts
│   │   │   │   └── index.ts
│   │   │   └── utils/            # Helpers
│   │   ├── data/                 # Mock data (for testing)
│   │   ├── stores/               # Zustand state stores
│   │   ├── types/                # TypeScript types
│   │   └── hooks/                # React hooks
│   ├── drizzle/                  # Migration files
│   ├── drizzle.config.ts         # Drizzle configuration
│   ├── package.json
│   └── .env.local                # Environment variables
├── docs/                         # Documentation
│   ├── architecture.md           # Agent architecture
│   ├── roadmap.md
│   ├── QUICK_START.md
│   ├── MOCK_DATA_GUIDE.md
│   ├── IMPLEMENTATION_SUMMARY.md
│   ├── hostaway-operations-audit.md
│   └── implementation-phases.md
└── README.md
```

## Common Commands

### Development

```bash
# Navigate to app directory
cd app

# Install dependencies
npm install

# Start dev server (Turbopack)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint
npm run lint
```

### Database Operations (Drizzle)

```bash
# Generate migrations from schema changes
npm run db:generate

# Apply migrations to database
npm run db:migrate

# Push schema directly to DB (skip migration files)
npm run db:push

# Seed database with initial data
npm run db:seed
```

**Important:** Always run database commands from the `app/` directory.

### Environment Setup

Required environment variables in `app/.env.local`:

```bash
# Database (Neon Postgres)
DATABASE_URL=postgresql://...

# Neon Auth
NEON_AUTH_BASE_URL=https://auth.neon.tech
NEON_AUTH_COOKIE_SECRET=<generate-via-openssl-rand-base64-32>

# PMS Mode
HOSTAWAY_MODE=db  # db | mock | live
```

**First-time setup:**
1. Copy `app/.env.example` to `app/.env.local`
2. Set `DATABASE_URL` to your Neon Postgres connection string
3. Generate `NEON_AUTH_COOKIE_SECRET`: `openssl rand -base64 32`
4. Run `npm run db:push` to create schema
5. Run `npm run db:seed` to populate initial data

## Database Schema

**13 Tables:**

| Table | Purpose |
|-------|---------|
| `listings` | Properties (name, area, bedrooms, price, floor/ceiling) |
| `calendar_days` | Daily availability & pricing per listing |
| `reservations` | Bookings (guest, channel, dates, price) |
| `proposals` | AI pricing proposals (current → proposed, risk, reasoning) |
| `executions` | Execution log (proposal → PMS sync status) |
| `chat_messages` | CRO chat history |
| `seasonal_rules` | Seasonal pricing rules per listing |
| `conversations` | Guest messaging threads |
| `conversation_messages` | Individual guest messages |
| `message_templates` | Predefined message templates |
| `tasks` | Task board (cleaning, maintenance, inspections) |
| `expenses` | Property expenses tracking |
| `owner_statements` | Monthly owner revenue statements |

**Field Naming:** Matches Hostaway API for future integration (`bedroomsNumber`, `bathroomsNumber`, `listingMapId`, etc.)

**Price Fields:** `numeric(10,2)` in DB, `number` in TypeScript

## Key Conventions

### API Field Names

Use Hostaway API field names in database and types:
- ✅ `bedroomsNumber`, `bathroomsNumber`
- ❌ `bedrooms`, `bathrooms`
- ✅ `price`, `currencyCode`, `personCapacity`
- ✅ `minimumStay`, `maximumStay` (camelCase)
- ✅ `listingMapId` (for reservation → listing reference)
- ✅ `nights` (reservation duration)

### UI Labels

Database uses `listings` table, but UI should display "Properties" for user-facing text.

### Number Formatting

Always use explicit locale for `toLocaleString()` to avoid SSR hydration mismatches:

```typescript
// ✅ Correct
price.toLocaleString("en-US")

// ❌ Causes hydration errors
price.toLocaleString()
```

### Date Handling

Use `date-fns` for all date operations:

```typescript
import { addDays, format, differenceInDays } from "date-fns";

const nextWeek = addDays(new Date(), 7);
const formatted = format(nextWeek, "yyyy-MM-dd");
```

### Database Queries

Use Drizzle ORM:

```typescript
import { db } from "@/lib/db/client";
import { listings, calendarDays } from "@/lib/db/schema";

// Query
const allListings = await db.select().from(listings);

// With joins
const listingsWithCalendar = await db
  .select()
  .from(listings)
  .leftJoin(calendarDays, eq(calendarDays.listingId, listings.id));
```

## Mock Data

For testing without live PMS:

```typescript
import { createPMSClient } from "@/lib/pms";

// Auto-switches based on HOSTAWAY_MODE
const client = createPMSClient();

const listings = await client.listListings();  // 5 Dubai properties
const calendar = await client.getCalendar(1001, startDate, endDate);
```

**5 Mock Properties:**
- Marina Heights 1BR (Dubai Marina)
- Downtown Residences 2BR (Downtown Dubai)
- JBR Beach Studio (JBR)
- Palm Villa 3BR (Palm Jumeirah)
- Bay View 1BR (Business Bay)

## Testing & Debugging

### Run Revenue Cycle

```typescript
import { runFullRevenueCycle } from "@/lib/agents";

const result = await runFullRevenueCycle({
  start: new Date(2026, 2, 1),
  end: new Date(2026, 2, 31)
});

console.log(result.stats);
// {
//   totalProposals: 324,
//   approvedCount: 289,
//   rejectedCount: 35,
//   avgPriceChange: 8
// }
```

### Check Active Mode

```typescript
const client = createPMSClient();
console.log(client.getMode()); // "mock" | "db" | "live"
```

### Database Debugging

```bash
# Check current schema
npm run db:push -- --dry-run

# Reset database (careful!)
# Drop all tables, re-run migrations, seed
```

## State Machine

System always in one state:

```
Connected → Observing → Simulating → Active
                ↓           ↓          ↓
              Paused ← ← ← ← ← ← ← ← ←
```

**Execution only allowed in `Active` state.**

Paused state requires explicit human action to resume (to `Observing`, not directly to `Active`).

## Integration with Hostaway

**Not yet implemented.** When ready:

1. Implement `HostawayClient` in `lib/pms/hostaway-client.ts`
2. Add OAuth 2.0 token management
3. Map Hostaway endpoints:
   - `GET /listings` → Data Aggregator
   - `GET /listings/{id}/calendar` → Data Aggregator
   - `PUT /listings/{id}/calendarIntervals` → Channel Sync (batch updates)
   - `GET /reservations` → Data Aggregator
4. Set `HOSTAWAY_MODE=live`
5. No application code changes needed (PMSClient interface unchanged)

## Deployment

**Platform:** Vercel

**Branches:**
- `main` → Production (auto-deploy enabled)
- `dev` → Staging (auto-deploy enabled)

**Database:**
- Production uses separate Neon branch
- Dev branch for local development
- Environment variables auto-configured via Vercel-Neon integration
- Neon Auth credentials manually configured per environment

```bash
# Deploy to production (push to main)
git push origin main

# Deploy to staging (push to dev)
git push origin dev
```

## Documentation

| File | Content |
|------|---------|
| `README.md` | Project vision, market, problem, solution |
| `docs/PRD.md` | MVP/POC Product Requirements Document |
| `docs/architecture.md` | Agent architecture, state machine, mock store |
| `docs/QUICK_START.md` | 30-second setup guide |
| `docs/MOCK_DATA_GUIDE.md` | Complete mock data API reference |
| `docs/IMPLEMENTATION_SUMMARY.md` | Build summary, metrics, next steps |
| `docs/DELIVERY_CHECKLIST.md` | Implementation delivery checklist |
| `docs/hostaway-operations-audit.md` | Full Hostaway API catalog + PriceOS coverage |
| `docs/implementation-phases.md` | 5-phase roadmap (Phase 0-4) |
| `docs/environments.md` | Environment setup guide |
| `docs/plans/` | Planning documents and session logs |

## Important Notes

- **Database is source of truth** - All data in Neon Postgres (HOSTAWAY_MODE=db)
- **Field names match Hostaway API** - For seamless future integration
- **Mock data still available** - Set HOSTAWAY_MODE=mock for testing
- **Price columns are numeric** - Use `numeric(10,2)` in DB, `number` in TS
- **Explicit locale required** - Use `toLocaleString("en-US")` to avoid hydration errors
- **All commands run from app/** - cd into app/ directory first

## Common Issues

**Database connection errors:**
- Verify `DATABASE_URL` is set in `app/.env.local`
- Check Neon dashboard for database status
- Ensure IP is allowlisted (if applicable)

**Hydration mismatches:**
- Always use explicit locale: `toLocaleString("en-US")`
- Check for client/server date formatting differences

**Migration issues:**
- Run `npm run db:push` instead of `db:generate` + `db:migrate` for faster iteration
- Use `db:generate` only when you need version-controlled migrations
