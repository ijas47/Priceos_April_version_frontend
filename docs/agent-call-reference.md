# PriceOS — Agent & Data Source Call Reference

> Who calls what, when, why, and how long the response is cached.

---

## Overview

PriceOS uses two kinds of intelligence:
- **Lyzr AI Agents** — language model agents that reason, search, and synthesise text
- **Third-party Data APIs** — structured numeric feeds (Airbtics, Eventbrite, Ticketmaster)

Both are expensive. Neither should be called more than necessary. Every call is either cached in MongoDB (`AirbticsCache`) or deduplicated by checking existing DB records before firing.

---

## 1. Trigger Map — What fires when

| User Action | Route Called | Agents / APIs Fired |
|-------------|-------------|---------------------|
| Click **"Run Aria"** | `POST /api/market-setup` | Marketing Agent, Benchmark Agent, Guardrails Agent (conditional), Eventbrite, Ticketmaster, DTCM, RSS, Airbtics |
| Send a **chat message** | `POST /api/agent/chat` or `/api/agent/route` | CRO Router Agent (always), sub-agents conditionally |
| Click **"Sync Events"** (Market page) | `POST /api/v1/system/events/sync` | Eventbrite, Ticketmaster, DTCM, RSS (no Lyzr agents) |
| Click **"Generate Proposals"** (Pricing page) | `POST /api/engine/run-all` | No agents — pure rule engine (`runPipeline`) |
| **Guest message reply** draft | `POST /api/inbox/draft-reply` | Chat Response Agent |
| **Guest conversation summary** | `POST /api/inbox/summarise` | Conversation Summary Agent |

---

## 2. Run Aria — Full call sequence

`POST /api/market-setup` — called from `unified-chat-interface.tsx → handleMarketSetup()`

```
User clicks "Run Aria"
        │
        ▼
[Step 0] Load property details + org market template
        │  Reads: Listing, Organization, MarketTemplate (MongoDB — free)
        │
        ▼
[Step 1a] Airbtics Market Context          ← QUANTITATIVE
        │  getMarketContext(marketId, bedrooms)
        │  Cache key: airbtics:summary:{marketId}:{bedrooms}   TTL 24h
        │              airbtics:metrics:{marketId}:{bedrooms}  TTL 12h
        │              airbtics:pacing:{marketId}:{bedrooms}   TTL  6h
        │  → 3-tier check: RAM → MongoDB → Airbtics API
        │
        ▼
[Step 1b] Event Feed Sync                  ← QUANTITATIVE
        │  syncEventFeeds(orgId, 90d, city)
        │  Fetches: Eventbrite + Ticketmaster + DTCM + Dubai RSS
        │  Cache key: events-sync:{orgId}:{city}               TTL  2h
        │  Dedup: if key exists in AirbticsCache → SKIP entirely
        │  Saves results to: MarketEvent (MongoDB)
        │
        ▼
[Step 2a] Marketing Agent (Lyzr)           ← QUALITATIVE
        │  Agent: LYZR_MARKETING_AGENT_ID (Marketing_Agent_ID)
        │  Prompt includes: city, date range, bedrooms, price,
        │                   Airbtics pacing snapshot, seasonal hints
        │  Returns JSON: { events[], holidays[], news[], daily_events[] }
        │  Cache key: marketing-agent:{orgId}:{city}:{dateFrom}:{dateTo}  TTL 12h
        │  Dedup: if key exists → SKIP, use cached JSON
        │  Saves results to: MarketEvent (MongoDB)
        │
        ▼
[Step 2b] Benchmark Agent (Lyzr)           ← QUALITATIVE
        │  Agent: LYZR_BENCHMARK_AGENT_ID (LYZR_Competitor_Benchmark_Agent_ID)
        │  Prompt includes: city, area, bedrooms, base price, date range,
        │                   Airbtics ADR percentiles (p25/p50/p75)
        │  Returns JSON: { rate_distribution, pricing_verdict, comps[] }
        │  Dedup: check BenchmarkData for same listingId+dateFrom+dateTo
        │          with updatedAt < 12h ago → if exists, SKIP agent call
        │  Saves results to: BenchmarkData (MongoDB)
        │
        ▼
[Step 3] Guardrails Agent (Lyzr)           ← CONDITIONAL
        │  Agent: LYZR_GUARDRAILS_AGENT_ID
        │  ONLY fires if: listing.priceFloor == 0 AND listing.priceCeiling == 0
        │  Prompt: property details + benchmark p25/p50/p90
        │  Returns: { suggested_floor, suggested_ceiling, reasoning }
        │  Saves results to: Listing.priceFloor / Listing.priceCeiling
        │  No TTL — runs once per property until floor/ceiling are set
        │
        ▼
[Step 4] Calendar metrics (MongoDB reads — free, no agent)
        │
        ▼
Response returned to UI → chat activated
```

---

## 3. Agent Chat — Call sequence

`POST /api/agent/chat` (or `/api/agent/route`) — called on every chat message

```
User sends a message
        │
        ▼
[Step 1] Build agent context
        │  buildAgentContext(orgId, listingId, dateRange)
        │  Reads from MongoDB (no external API calls):
        │    - Listing details (price, floor, ceiling)
        │    - InventoryMaster (calendar status, proposed prices)
        │    - Reservations (active bookings)
        │    - PricingRules (enabled rules)
        │    - MarketEvent (events in date range)
        │    - Airbtics pacing (from AirbticsCache — no new API call)
        │  All injected as structured JSON into the agent prompt
        │
        ▼
[Step 2] CRO Router Agent (Lyzr)           ← ALWAYS CALLED
        │  Agent: LYZR_CRO_ROUTER_AGENT_ID (AGENT_ID)
        │  Role: Reads the full context + user question, decides the answer
        │  No sub-agents are called from chat — CRO has the full context
        │  No cache — every message is a live inference
        │
        ▼
Response streamed back to chat UI
```

> **Why no cache on chat?** Each message is unique. The context (inventory, bookings, events) changes daily. Caching answers would give stale pricing advice.

---

## 4. All agents — Reference table

| Constant | Lyzr Agent | Env Var | Called By | TTL |
|----------|-----------|---------|-----------|-----|
| `CRO_ROUTER_AGENT_ID` | CRO / Chief Revenue Officer | `AGENT_ID` | Every chat message | None |
| `MARKETING_AGENT_ID` | Marketing / Event Research | `Marketing_Agent_ID` | Run Aria | **12h** (per org+city+dateRange) |
| `BENCHMARK_AGENT_ID` | Competitor Benchmark | `LYZR_Competitor_Benchmark_Agent_ID` | Run Aria | **12h** (per listing+dateRange) |
| `GUARDRAILS_AGENT_ID` | Price Guardrails | `Lyzr_Guardrail_Agent_for_Floor_Ceiling_Values` | Run Aria | **Once** (until floor/ceiling set) |
| `CONVERSATION_SUMMARY_AGENT_ID` | Guest Conversation Summary | `LYZR_Conversation_Summary_Agent_ID` | Inbox summarise | None |
| `CHAT_RESPONSE_AGENT_ID` | Guest Reply Drafter | `LYZR_Chat_Response_Agent_ID` | Inbox draft reply | None |
| `PROPERTY_ANALYST_ID` | Property Analyst | `LYZR_PROPERTY_ANALYST_AGENT_ID` | Fallback for benchmark | 12h |
| `MARKET_RESEARCH_ID` | Market Research | `LYZR_MARKET_RESEARCH_AGENT_ID` | Fallback for marketing | 12h |
| `PRICE_GUARD_ID` | Price Guard | `LYZR_PRICE_GUARD_AGENT_ID` | Reserved | — |
| `BOOKING_INTELLIGENCE_ID` | Booking Intelligence | `LYZR_BOOKING_INTELLIGENCE_AGENT_ID` | Reserved | — |

---

## 5. Third-party APIs — Reference table

| API | Provider | Env Var | Called By | TTL | Scope |
|-----|----------|---------|-----------|-----|-------|
| Events search | Eventbrite | `EVENTBRITE_API_KEY` | Run Aria, Sync Events | **2h** | Per org+city |
| Events search | Ticketmaster | `TICKETMASTER_API_KEY` | Run Aria, Sync Events | **2h** | Per org+city |
| Annual events | DTCM (static fallback) | — | Run Aria, Sync Events | **2h** | Per org+city |
| Events RSS | Dubai Calendar / Time Out | — | Run Aria, Sync Events | **2h** | Per org+city |
| Market summary | Airbtics | `AIRBTICS_API_KEY` | Run Aria, Pricing Engine | **24h** | Per marketId+bedrooms |
| ADR percentiles | Airbtics | `AIRBTICS_API_KEY` | Run Aria, Pricing Engine | **12h** | Per marketId+bedrooms |
| Booking pacing | Airbtics | `AIRBTICS_API_KEY` | Run Aria, Pricing Engine | **6h** | Per marketId+bedrooms |

---

## 6. Cache TTL summary

```
─────────────────────────────────────────────────────────────────
 Data type                  TTL     Cache key pattern
─────────────────────────────────────────────────────────────────
 Airbtics market summary    24 h    airbtics:summary:{marketId}:{bedrooms}
 Airbtics ADR percentiles   12 h    airbtics:metrics:{marketId}:{bedrooms}
 Airbtics booking pacing     6 h    airbtics:pacing:{marketId}:{bedrooms}
 Event feed sync (all 4)     2 h    events-sync:{orgId}:{city}
 Marketing agent result     12 h    marketing-agent:{orgId}:{city}:{from}:{to}
 Benchmark agent result     12 h    BenchmarkData.updatedAt (MongoDB doc)
 Guardrails agent           once    Listing.priceFloor / priceCeiling != 0
 Chat responses             none    (every message is live)
─────────────────────────────────────────────────────────────────
```

Cache storage: **AirbticsCache** (MongoDB collection) + in-memory Map (per server process).

---

## 7. Deduplication logic — Run Aria

This is the most important cost-control mechanism. Here is exactly what happens when the user clicks Run Aria multiple times or switches properties:

```
Scenario A — First click, Property A, dates Apr 25–May 25
  Events sync:       FIRES  → saves to MarketEvent
  Airbtics:          FIRES  → saves to AirbticsCache
  Marketing agent:   FIRES  → saves result to AirbticsCache
  Benchmark agent:   FIRES  → saves to BenchmarkData
  Guardrails agent:  FIRES if floor/ceiling = 0

Scenario B — Second click, Property A, same dates (within 2h)
  Events sync:       SKIPPED  (cache hit: events-sync:{orgId}:dubai)
  Airbtics:          SKIPPED  (cache hit: all 3 keys)
  Marketing agent:   SKIPPED  (cache hit: marketing-agent:{orgId}:dubai:Apr25:May25)
  Benchmark agent:   SKIPPED  (BenchmarkData exists for A + same dates < 12h)
  Guardrails agent:  SKIPPED  (floor/ceiling already set from Scenario A)
  → Response: instant. Zero external API calls.

Scenario C — Switch to Property B, same dates (within 2h)
  Events sync:       SKIPPED  (same city cache still valid)
  Airbtics:          SKIPPED  (same marketId + bedrooms cache still valid)
  Marketing agent:   SKIPPED  (same city + dates cache still valid)
  Benchmark agent:   FIRES    (different listingId — BenchmarkData for B doesn't exist)
  Guardrails agent:  FIRES if B has floor/ceiling = 0

Scenario D — Property A, different dates (new date range)
  Events sync:       SKIPPED  (city-level, date-agnostic — still cached)
  Airbtics:          SKIPPED  (market-level, date-agnostic — still cached)
  Marketing agent:   FIRES    (new cache key: different dateFrom/dateTo)
  Benchmark agent:   FIRES    (new dateFrom/dateTo — no BenchmarkData for those dates)
  Guardrails agent:  SKIPPED  (floor/ceiling already set)
```

---

## 8. Where results are stored in MongoDB

| Agent / API | Saves to | MongoDB Collection |
|-------------|----------|--------------------|
| Marketing Agent | Events, holidays, news | `marketevents` |
| Eventbrite, Ticketmaster, DTCM, RSS | Live events | `marketevents` |
| Benchmark Agent | Rate distribution, comp set | `benchmarkdatas` |
| Guardrails Agent | Floor + ceiling prices | `listings` |
| Airbtics (all 3 endpoints) | Raw API responses | `airbticscaches` |
| CRO Agent (chat) | Chat history | `chatmessages` |
| Chat Response Agent | Draft reply (returned, not stored) | — |
| Conversation Summary Agent | Insight record | `insights` |

---

## 9. Context injected into Agent Chat

When a user sends a chat message, `buildAgentContext()` assembles the following data from MongoDB and passes it as JSON to the CRO agent. No external API is called during chat.

```
context = {
  MANDATORY_INSTRUCTIONS: { analysis_window, instruction_1, instruction_2 },
  property:       { id, name, area, city, bedrooms, current_price, floor_price, ceiling_price },
  inventory:      [ { date, status, price, proposed_price, min_stay, max_stay }, ... ],
  metrics:        { total_days, bookable_days, booked_days, occupancy_pct, total_revenue },
  active_bookings:[ { guest_name, channel, check_in, check_out, nights, total_price }, ... ],
  pricing_rules:  [ { name, type, priority, adjust_pct, days_of_week }, ... ],
  market_events:  [ { name, start, end, impact, premium_pct, description }, ... ],
  market_pacing:  { source: "airbtics", high_demand_days: [...], p50_adr, p75_adr }
                  ← only present when Airbtics data is cached for this market
}
```

The CRO agent reads this context and can answer questions like:
- "Why is April 30th priced at AED 950?" → cross-references market_pacing (82% booked) + market_events (GITEX conference)
- "What's my occupancy next month?" → reads inventory.metrics
- "Am I underpriced vs competitors?" → reads benchmark from BenchmarkData (injected via market_pacing.p50_adr)

---

## 10. Pricing Engine — No Lyzr agents (deterministic + cached intel)

The pricing engine (`runPipeline` → `computeDay`) runs **without Lyzr**. It reads
pre-computed and ingested data from MongoDB and optional Airbtics/Dubai datasets.

```
runPipeline(listingId)
  │
  ├─ Reads: Organization (pricingStrategy, guardrails, eventPricingWeight)
  ├─ Reads: DubaiMarketMonthly / DubaiCompListing (Dubai listings — primary)
  ├─ Reads: Airbtics market context + BenchmarkData (fallback / non-Dubai)
  ├─ Reads: InventoryMaster (calendar status + current prices)
  ├─ Reads: PricingRule (manual rules; [UAE]/[Auto] SEASON % rules filtered out)
  ├─ Reads: MarketEvent (per-day event uplift caps)
  ├─ Reads: Reservations (booking pace vs STLY, recency)
  │
  ├─ Layer 0: Month-first market anchor (per-day month p50/p25/p75)
  ├─ Layer A: Waterfall (profiles, LM, gaps, occupancy matrix)
  ├─ Layer B: Elasticity + demand modifier + event uplift
  ├─ Layer C: Proposal guardrails (max daily Δ%, auto-approve threshold)
  │
  └─ Writes: InventoryMaster (proposedPrice, proposalStatus, reasoning, …)
```

**Month-first anchor** de-anchors pricing from a flat Hostaway base when monthly
market ADR exists (critical for Dubai summer vs winter). The UAE seasonal
**calendar** switches tactical profiles only — not stacked `%` season rules.

**Strategy presets** (Conservative / Balanced / Aggressive) are re-applied every
run from `Organization.pricingStrategy`.

**Auto-approve:** proposals with `|changePct| ≤ settings.guardrails.autoApproveThreshold`
are written with `proposalStatus="approved"`. Push to Hostaway still requires
approve API + `HOSTAWAY_READ_ONLY=false`.

Aria chat is **orthogonal** — it explains proposals using the same inventory
payload but does not compute prices.
