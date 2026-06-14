# PriceOS — Internal Architecture & System Design

**Version**: 2.0 | **Last Updated**: March 6, 2026  
**Status**: Production | **Platform**: Web Application (SaaS)

---

## 1. Executive Overview

PriceOS is an **AI-powered dynamic pricing copilot** purpose-built for Dubai short-term rental (STR) property managers. It replaces manual pricing spreadsheets with an autonomous multi-agent system that scans the internet for market intelligence, benchmarks competitors in real-time, and generates daily pricing recommendations — all through a conversational interface called **Aria**.

### What Makes PriceOS Unique
| Capability | Traditional Tools | PriceOS |
|---|---|---|
| Pricing decisions | Manual / rule-based | AI agents with real-time internet access |
| Market intelligence | Static reports | Live scanning (events, wars, currency, weather) |
| User interface | Dashboards with sliders | Conversational AI ("Aria, what should I price?") |
| Competitor data | Quarterly surveys | Real-time Airbnb/Booking.com scraping |
| Safety guardrails | None | Multi-layer: PriceGuard + Guardrails Agent |

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 16 (App Router) + React 19 | Server-side rendered web application |
| **Styling** | Tailwind CSS 4 + shadcn/ui (Radix primitives) | Premium dark-mode UI |
| **State Management** | Zustand | Client-side stores for property, chat, sync states |
| **Database** | Neon (Serverless PostgreSQL) | Fully managed, auto-scaling Postgres |
| **ORM** | Drizzle ORM | Type-safe SQL queries with zero overhead |
| **AI Orchestration** | Lyzr Studio | Multi-agent hosting, prompt management, tool calling |
| **AI Models** | Gemini 3.0 Flash (chat), GPT-4o (search), GPT-4o-mini (compute) | Different models for different tasks |
| **Internet Search** | Perplexity Sonar LLM | Real-time web search for Agents 6 & 7 |
| **PMS Integration** | Hostaway API | Property, calendar, and reservation sync |
| **Authentication** | Neon Auth (Stack Auth) | Secure user management |
| **Deployment** | Vercel | Edge-optimized serverless deployment |
| **Charts** | Recharts | Revenue and occupancy visualizations |

---

## 3. System Architecture

### 3.1 High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                        │
│  Dashboard │ Calendar │ Chat (Aria) │ Properties │ Inbox     │
└─────────────────┬───────────────────────────┬───────────────┘
                  │                           │
                  ▼                           ▼
┌─────────────────────────┐    ┌──────────────────────────────┐
│   SETUP PHASE            │    │   CHAT PHASE                 │
│   (One-click "Run Aria") │    │   (Conversational)           │
│                          │    │                              │
│  ┌──────────┐ ┌────────┐│    │  ┌───────────────────────┐   │
│  │ Agent 6  │ │Agent 7 ││    │  │ Agent 1: CRO Router   │   │
│  │Marketing │ │Benchmark││   │  │ "Aria" (Orchestrator) │   │
│  │ 🌐 Sonar │ │🌐 Sonar││    │  └───────┬───────────────┘   │
│  └────┬─────┘ └───┬────┘│    │          │                    │
│       │           │      │    │    ┌─────┼─────┬─────┐       │
│       ▼           ▼      │    │    ▼     ▼     ▼     ▼       │
│  ┌────────────────────┐  │    │  Ag.2  Ag.3  Ag.4  Ag.5     │
│  │  Agent 10:         │  │    │  Prop  Book  Mkt   Price    │
│  │  Guardrails Agent  │  │    │  Anlst Intel Rsrch Guard    │
│  └────────┬───────────┘  │    │                              │
│           │              │    │  (All read from injected     │
│           ▼              │    │   JSON — zero DB access)     │
└───────────┬──────────────┘    └──────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                    NEON POSTGRESQL DATABASE                   │
│                                                              │
│  listings │ inventory_master │ reservations │ market_events   │
│  benchmark_data │ chat_messages │ guest_summaries            │
│  hostaway_conversations │ user_settings                      │
└─────────────────────────────────────────────────────────────┘
            ▲
            │
┌───────────┴──────────────┐
│   HOSTAWAY PMS SYNC       │
│   (Listings, Calendar,    │
│    Reservations, Guests)  │
└───────────────────────────┘
```

### 3.2 Two-Phase Architecture

PriceOS operates in **two distinct phases**. This is the most important architectural concept to understand:

#### Phase 1: Setup Phase ("Run Aria" Button)
**When**: User clicks "Run Aria" or "Market Analysis" in the UI.  
**What happens**: Two internet-connected agents scan the web in parallel.  
**Duration**: 15-30 seconds.

| Agent | Model | Task | Output |
|---|---|---|---|
| Agent 6 (Marketing) | GPT-4o via Sonar | Searches for events, wars, travel advisories, holidays, weather, economic signals | Writes to `market_events` table |
| Agent 7 (Benchmark) | GPT-4o via Sonar | Searches Airbnb/Booking.com for 10-15 competitor prices | Writes to `benchmark_data` table |
| Agent 10 (Guardrails) | GPT-4o-mini | Computes floor/ceiling prices from benchmark data | Updates `listings` table |

#### Phase 2: Chat Phase (Conversational AI)
**When**: User sends a message to Aria.  
**What happens**: Aria orchestrates 4 offline agents using pre-cached data.  
**Duration**: 5-15 seconds per response.

| Agent | Model | Task | Data Source |
|---|---|---|---|
| Agent 1 (Aria/CRO Router) | Gemini 3.0 Flash | Orchestrates all agents, generates final response | Injected JSON payload |
| Agent 2 (Property Analyst) | GPT-4o-mini | Gap analysis, LOS optimization, seasonal patterns | Passed by Aria |
| Agent 3 (Booking Intelligence) | GPT-4o-mini | Velocity, revenue, channel mix analysis | Passed by Aria |
| Agent 4 (Market Research) | GPT-4o-mini | Parses pre-cached events, news, competitors | Passed by Aria |
| Agent 5 (PriceGuard) | GPT-4o-mini | Final pricing validation, safety guardrails | Passed by Aria |

> **Key Insight**: Only Agents 6 and 7 have internet access. All chat agents work with cached data from the last "Run Aria" scan.

---

## 4. Database Schema (ERD)

PriceOS uses **9 PostgreSQL tables** in Neon, designed for zero-JSONB (except where unavoidable for AI output shapes):

```
┌──────────────┐       ┌───────────────────┐       ┌──────────────────┐
│   LISTINGS   │       │ INVENTORY_MASTER  │       │  RESERVATIONS    │
├──────────────┤       ├───────────────────┤       ├──────────────────┤
│ id (PK)      │──┐    │ id (PK)           │       │ id (PK)          │
│ hostaway_id  │  │    │ listing_id (FK) ──┼──→    │ listing_id (FK)  │
│ name         │  │    │ date              │       │ start_date       │
│ area         │  │    │ status            │       │ end_date         │
│ city         │  │    │ current_price     │       │ total_price      │
│ bedrooms     │  │    │ min_stay          │       │ price_per_night  │
│ bathrooms    │  │    │ max_stay          │       │ guest_name       │
│ person_cap   │  │    │ source            │       │ channel_name     │
│ price        │  │    └───────────────────┘       │ num_guests       │
│ price_floor  │  │                                │ status           │
│ price_ceiling│  │    ┌───────────────────┐       └──────────────────┘
│ floor_reason │  │    │  MARKET_EVENTS    │
│ ceiling_rsn  │  │    ├───────────────────┤       ┌──────────────────┐
│ amenities    │  ├───→│ listing_id (FK)   │       │ BENCHMARK_DATA   │
│ guardrails_  │  │    │ title             │       ├──────────────────┤
│   source     │  │    │ start_date        │       │ listing_id (FK)  │
└──────────────┘  │    │ end_date          │       │ date_from        │
                  │    │ event_type        │       │ date_to          │
                  │    │ expected_impact   │       │ p25/p50/p75/p90  │
                  │    │ confidence        │       │ avg_weekday      │
                  │    │ sentiment         │       │ avg_weekend      │
                  │    │ demand_impact     │       │ verdict          │
                  │    │ suggested_premium │       │ recommended_*    │
                  │    │ source (URL)      │       │ comps (JSONB)    │
                  │    └───────────────────┘       └──────────────────┘
                  │
                  │    ┌───────────────────┐       ┌──────────────────┐
                  ├───→│  CHAT_MESSAGES    │       │ GUEST_SUMMARIES  │
                  │    ├───────────────────┤       ├──────────────────┤
                  │    │ listing_id        │       │ listing_id (FK)  │
                  │    │ structured (JSONB)│       │ date_from        │
                  │    │ created_at        │       │ date_to          │
                  │    └───────────────────┘       │ sentiment        │
                  │                                │ themes (JSONB)   │
                  │    ┌───────────────────┐       │ action_items     │
                  └───→│  USER_SETTINGS    │       └──────────────────┘
                       ├───────────────────┤
                       │ user_id           │       ┌──────────────────┐
                       │ default_listing   │       │ HOSTAWAY_CONVOS  │
                       │ hostaway_token    │       ├──────────────────┤
                       │ sync preferences  │       │ listing_id (FK)  │
                       └───────────────────┘       │ guest_name       │
                                                   │ messages (JSONB) │
                                                   └──────────────────┘
```

### Table Purposes
| Table | Role | Write Source | Read By |
|---|---|---|---|
| `listings` | Property registry (from PMS) | Hostaway Sync + Agent 10 | All agents, UI |
| `inventory_master` | Daily price calendar | Hostaway Sync | Calendar UI, Chat payload |
| `reservations` | Guest bookings & revenue | Hostaway Sync | Booking Intelligence, Dashboard |
| `market_events` | AI market intelligence | Agent 6 (Marketing) | Agent 4, Chat payload |
| `benchmark_data` | Competitor pricing | Agent 7 (Benchmark) | Agent 5, Chat payload |
| `chat_messages` | Conversation history | Chat API | Chat UI |
| `user_settings` | User configuration | Settings UI | Auth, Sync |
| `guest_summaries` | AI guest comms analysis | Summary Agent | Inbox UI |
| `hostaway_conversations` | Raw guest messages | Hostaway Sync | Guest Reply Agent |

---

## 5. AI Agent Architecture (Deep Dive)

### 5.1 Agent Roster

PriceOS uses **10 specialized AI agents**, each with a single responsibility:

| # | Agent | Model | Internet? | Phase | Core Responsibility |
|---|---|---|---|---|---|
| 1 | CRO Router ("Aria") | Gemini 3.0 Flash | ❌ | Chat | User-facing orchestrator. Routes queries to sub-agents. |
| 2 | Property Analyst | GPT-4o-mini | ❌ | Chat | Gap detection, LOS optimization, seasonal analysis. |
| 3 | Booking Intelligence | GPT-4o-mini | ❌ | Chat | Velocity, revenue, channel mix, booking patterns. |
| 4 | Market Research | GPT-4o-mini | ❌ | Chat | Parses pre-cached events/news/competitors into factors. |
| 5 | PriceGuard | GPT-4o-mini | ❌ | Chat | Final pricing engine + safety validator. Veto power. |
| 6 | Marketing Intelligence | GPT-4o (Sonar) | ✅ | Setup | 7-step internet sweep: threats, events, economy, weather. |
| 7 | Benchmark Agent | GPT-4o (Sonar) | ✅ | Setup | Competitor pricing from Airbnb/Booking.com. |
| 10 | Guardrails Agent | GPT-4o-mini | ❌ | Setup | Computes intelligent floor/ceiling prices. |
| — | Conv. Summary Agent | GPT-4o-mini | ❌ | On-demand | Analyzes guest conversations for patterns. |
| — | Guest Reply Agent | GPT-4o-mini | ❌ | On-demand | Auto-generates guest replies with DB lookup. |

### 5.2 The "Aria" Chat Flow (Agent 1 → Sub-Agents)

When a user sends a message like *"Give me the full analysis"*, this is the exact execution flow:

```
User Message: "Full analysis"
        │
        ▼
┌───────────────────────────────────────────────────────┐
│  chat/route.ts (API)                                   │
│  1. Identify listing + date range                      │
│  2. Query DB: listings, inventory, reservations,       │
│     benchmark_data, market_events                      │
│  3. Build JSON payload with:                           │
│     - today's date                                     │
│     - market_data_scanned_at (freshness)               │
│     - analysis_window, property, metrics               │
│     - benchmark (p25/p50/p75/p90, recommended rates)   │
│     - market_events, news, daily_events                │
│     - demand_outlook, recent_reservations              │
│  4. Inject payload into first message to Aria           │
│  5. Forward to Lyzr Studio API                         │
└───────────────────────┬───────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────┐
│  Agent 1: CRO Router ("Aria")                          │
│                                                        │
│  STEP 1: Check for RED ALERTS (negative_high news)     │
│  STEP 2: Check data freshness (>48h = warn)            │
│  STEP 3: Check for anomalies (p50 vs current_price)    │
│  STEP 4: Classify intent → route to sub-agents         │
│  STEP 5: Merge all outputs into 11-section report      │
│  STEP 6: End with proactive revenue question           │
└───────────────────────────────────────────────────────┘
        │
        ├──→ @PropertyAnalyst → gaps, restrictions, LOS
        ├──→ @BookingIntelligence → velocity, revenue, channels
        ├──→ @MarketResearch → events, competitors, news factors
        └──→ @PriceGuard → pricing proposals for EVERY date
```

### 5.3 Safety & Anti-Hallucination Protocols

PriceOS implements **4 layers of protection** against AI errors:

| Layer | Agent | Protection | Example |
|---|---|---|---|
| **Layer 1**: Date Verification | Agent 6 | "2026 Mention Rule" — rejects events without explicit year | Prevents using 2025 Art Dubai dates for 2026 |
| **Layer 2**: Scale Check | Agent 7 | Bedroom-aware rate thresholds (1BR <1500, 4BR <6000 AED) | Rejects monthly rental data mistaken as nightly |
| **Layer 3**: Crisis Override | Agent 5 | Geopolitical events override event premiums | A war cancels Art Dubai premiums |
| **Layer 4**: Anomaly Alert | Agent 1 | Warns user if p50 > 200% of current price | "Market median seems wrong — using conservative pricing" |

### 5.4 The 7-Step Intelligence Sweep (Agent 6)

This is the most critical process in the system. Agent 6 executes these searches in order:

| Step | Category | What It Searches For | Impact on Pricing |
|---|---|---|---|
| 1 | 🔴 Geopolitical | Iran-UAE tensions, Yemen attacks, Israel-Palestine, flight disruptions, travel advisories, pandemics | -40% to -60% (direct threat) |
| 2 | 📅 Calendar | Ramadan phase, Eid, public holidays, school holidays | -20% (early Ramadan) to +50% (Eid week) |
| 3 | 🎪 Events | Exhibitions, conferences, festivals, concerts, sports | +10% to +30% (high-impact event) |
| 4 | 🏘️ Neighborhood | Landmark closures, local activities, micro-events | -10% (major closure) |
| 5 | 💹 Economic | Tourism numbers, currency rates (INR/GBP/EUR to AED), oil, hotel occupancy | -3% to +5% |
| 6 | 🌡️ Weather | Heat waves, sandstorms, pleasant conditions | -40% (summer) to +0% |
| 7 | 📱 Viral/Trending | Dubai trending on social media, scam warnings, new attractions | -5% to +5% |

---

## 6. API Architecture

### 6.1 API Routes

| Route | Method | Purpose | Auth? |
|---|---|---|---|
| `/api/chat` | POST | Send message to Aria, get AI response | ✅ |
| `/api/market-setup` | POST | Trigger Setup Phase (Agents 6, 7, 10) | ✅ |
| `/api/calendar-metrics` | GET | Occupancy, booked/available/blocked days | ✅ |
| `/api/calendar` | GET | Daily inventory with prices | ✅ |
| `/api/listings` | GET | Property list with details | ✅ |
| `/api/listings/[id]` | GET/PATCH | Single property CRUD | ✅ |
| `/api/benchmark` | GET | Competitor benchmark data | ✅ |
| `/api/events` | GET | Market events and news | ✅ |
| `/api/reservations` | GET | Guest bookings | ✅ |
| `/api/proposals` | GET/POST/PATCH | AI pricing proposals | ✅ |
| `/api/sync/[type]` | POST | Hostaway data sync (listings, calendar, reservations) | ✅ |
| `/api/hostaway/*` | Various | PMS integration endpoints | ✅ |
| `/api/conversations` | GET | Guest communication threads | ✅ |
| `/api/auth/*` | Various | Authentication (Neon Auth) | — |

### 6.2 External API Integrations

| Service | Purpose | Method | Rate Limits |
|---|---|---|---|
| **Lyzr Studio** | AI agent hosting & inference | REST API (`studio.lyzr.ai`) | Per-plan |
| **Hostaway** | Property management data sync | REST API (`api.hostaway.com`) | 100 req/min |
| **Neon** | PostgreSQL database | Serverless driver | Unlimited |
| **Perplexity Sonar** | Real-time internet search (via Lyzr) | Embedded in Agents 6 & 7 | Per-plan |

---

## 7. Frontend Architecture

### 7.1 Page Structure

```
/                         → Landing page (public)
/login                    → Authentication
/dashboard                → Overview: occupancy, revenue, tasks
/dashboard/agent-chat     → Aria Chat (main pricing interface)
/dashboard/calendar       → Visual calendar with daily prices
/dashboard/properties     → Property listing & management
/dashboard/bookings       → Reservation management
/dashboard/inbox          → Guest communications
/dashboard/finance        → Revenue & expense tracking
/dashboard/insights       → Market intelligence dashboard
/dashboard/pricing        → Price management & proposals
/dashboard/proposals      → AI pricing proposal review
/dashboard/operations     → Sync status & data management
/dashboard/profile        → User settings & PMS configuration
```

### 7.2 Key Components

| Component Group | Components | Purpose |
|---|---|---|
| **Chat** | ChatPanel, MessageBubble, ActivityStep, ProposalDrawer | Aria conversation + pricing proposals |
| **Calendar** | CalendarGrid, DayCell, PriceEditor | Visual price calendar management |
| **Dashboard** | MetricCard, OccupancyChart, RevenueChart | KPI overview |
| **Properties** | PropertyCard, PropertyDetail, SyncStatusBar | Property management |
| **Inbox** | ConversationList, MessageThread, GuestReplyButton | Guest communication |
| **Layout** | Sidebar, TopBar, PropertySelector, DateRangePicker | Navigation chrome |
| **UI** | Button, Card, Dialog, Tooltip, Badge (shadcn/ui) | Design system primitives |

### 7.3 State Management (Zustand)

| Store | Purpose | Key State |
|---|---|---|
| `propertyStore` | Selected property context | `selectedProperty`, `listings[]` |
| `chatStore` | Chat session management | `messages[]`, `isLoading`, `sessionId` |
| `syncStore` | Data sync status | `syncStatus`, `lastSynced`, `errors` |

---

## 8. Data Sync Pipeline (Hostaway → PriceOS)

```
Hostaway PMS API
        │
        ▼
┌───────────────────┐
│  /api/sync/[type] │
│  Sync Controller  │
│                   │
│  Types:           │
│  • listings       │  ← Property details, amenities, location
│  • calendar       │  ← Daily prices, availability, min-stay
│  • reservations   │  ← Guest bookings, revenue, channels
│  • conversations  │  ← Guest messages, complaints, requests
└───────────┬───────┘
            │
            ▼
┌───────────────────────────────────────────┐
│  Sync Logic (sync-server-utils.ts)         │
│                                            │
│  1. Fetch page-by-page from Hostaway API   │
│  2. Transform to PriceOS schema            │
│  3. Upsert (INSERT ... ON CONFLICT UPDATE) │
│  4. Track sync metadata (last_synced)      │
│  5. Handle rate limits (100 req/min)       │
└───────────────────────────────────────────┘
```

---

## 9. Security Architecture

| Layer | Implementation |
|---|---|
| **Authentication** | Neon Auth (Stack Auth) — JWT-based, per-user sessions |
| **API Protection** | Every API route validates `userId` from session token |
| **PMS Credentials** | Hostaway API keys stored in `user_settings` (encrypted at rest in Neon) |
| **Data Isolation** | All queries filtered by `userId` — no cross-user data leakage |
| **AI Safety** | PriceGuard has unconditional veto power — CRO Router cannot override |
| **Price Guardrails** | Floor/ceiling prices prevent catastrophic over/under-pricing |
| **Guest Privacy** | Guest names visible only to property owner; AI never exposes PII |

---

## 10. Deployment Architecture

```
┌────────────────────┐     ┌────────────────────┐
│   Vercel Edge       │     │   Neon Serverless   │
│   (Next.js SSR)     │────→│   (PostgreSQL)      │
│                     │     │                     │
│   • Auto-scaling    │     │   • Auto-scaling    │
│   • Edge functions  │     │   • Branching       │
│   • CDN for assets  │     │   • Connection pool  │
└────────────────────┘     └────────────────────┘
         │
         ├──→ Lyzr Studio (AI inference)
         ├──→ Hostaway API (PMS data)
         └──→ Perplexity Sonar (web search)
```

---

## 11. Cost Structure

| Service | Billing Model | Approx. Monthly (10 properties) |
|---|---|---|
| Vercel | Per-invocation + bandwidth | ~$20/mo |
| Neon PostgreSQL | Compute hours + storage | ~$19/mo (Pro plan) |
| Lyzr Studio | Per-agent-call | ~$50-100/mo |
| Hostaway API | Included with PMS subscription | $0 |

---

## 12. Key Design Decisions & Rationale

### Why Multi-Agent (Not Single LLM)?
A single LLM cannot search the internet, validate prices, AND generate reports all in one call. By splitting into 10 agents, each agent has a **narrow, verifiable scope**. If PriceGuard rejects a price, we know exactly why. If Agent 6 finds a war, we can trace the data flow to every pricing decision.

### Why Gemini for Aria?
Gemini 3.0 Flash has the largest context window and fastest latency for chat orchestration. GPT-4o is used for internet search agents because Perplexity Sonar is coupled to OpenAI-compatible APIs.

### Why Neon (Not Supabase)?
Neon's serverless driver (`@neondatabase/serverless`) supports WebSocket connections from Vercel Edge Functions — critical for sub-100ms database queries in serverless environments.

### Why No Real-Time Pricing?
PriceOS uses a **two-phase architecture** (Setup + Chat) instead of real-time pricing because:
1. Internet searches (Agent 6, 7) take 15-30 seconds — too slow for real-time.
2. Competitor prices don't change minute-by-minute — daily scans are sufficient.
3. Property managers want to **review** pricing before applying — not auto-apply.

### Why Floor/Ceiling Guardrails?
In hospitality, pricing errors are asymmetric:
- **Overpricing**: Loses one night of revenue (guest books elsewhere)
- **Underpricing**: Creates viral "cheap" perception that's hard to undo

Floor/ceiling prices create a "safe zone" where AI pricing decisions cannot cause catastrophic damage.

---

## 13. Glossary

| Term | Definition |
|---|---|
| **PMS** | Property Management System (Hostaway) — the source of truth for bookings |
| **STR** | Short-Term Rental (Airbnb, Booking.com, Vrbo listings) |
| **ADR** | Average Daily Rate — total revenue ÷ booked nights |
| **LOS** | Length of Stay — minimum/maximum night requirements |
| **P50 / P75 / P90** | Percentile rates from competitor benchmark (50th = median) |
| **CRO** | Chief Revenue Officer — the persona Aria embodies |
| **Sonar LLM** | Perplexity's internet-connected language model |
| **Setup Phase** | Internet-connected scan triggered by "Run Aria" |
| **Chat Phase** | Conversational AI using pre-cached data |
| **PriceGuard** | Agent 5 — the final pricing validator with veto power |
| **Guardrails** | Floor (minimum) and ceiling (maximum) nightly prices |

---

*Document prepared for client review. For technical questions, contact the PriceOS engineering team.*
