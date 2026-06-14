# PriceOS Database Schema (MongoDB / Mongoose)

> Current data model. PriceOS uses **MongoDB** with **Mongoose** ODM — not
> PostgreSQL/Drizzle (an earlier prototype). Model definitions live in
> `src/lib/db/models/`; the connection singleton is `src/lib/db/client.ts`.
>
> **Tenancy:** data-bearing collections carry an `orgId` (ObjectId, indexed)
> and every API query is scoped by it. Field names mirror the Hostaway API for
> clean integration (`bedroomsNumber`, `listingMapId`, etc.).

## Collections

| Collection (model) | Purpose | Key fields |
|--------------------|---------|-----------|
| **Organization** | Tenant / account (a property-management company). | `name`, `email`, `passwordHash`, `role`, `isApproved`, onboarding state |
| **User** | A user within an organization. | `orgId`, `email`, `passwordHash`, `role` |
| **Listing** | A property. Source of truth for property config + guardrails. | `orgId`, `name`, `area`, `city`, `countryCode`, `bedroomsNumber`, `bathroomsNumber`, `price` (base), `priceFloor`, `priceCeiling`, `hostawayId`, strategy config (last-minute/far-out/DOW/gap-fill), `guardrailsSource` |
| **InventoryMaster** | Per-listing, per-day calendar + pricing/proposal state. The pricing engine writes here. | `orgId`, `listingId`, `date`, `currentPrice`, `basePrice`, `status`, `proposedPrice`, `proposalStatus`, `changePct`, `reasoning`, `minStay`/`maxStay`, `closedToArrival/Departure`, `batchId`, **`elasticityPrice`**, **`elasticityWeight`**, **`pBook`** (revenue-optimization shadow/live values) |
| **Reservation** | Bookings. | `orgId`, `listingMapId`, `checkIn`, `checkOut`, `nights`, guest, channel, price |
| **PricingRule** | Operator pricing rules (season/event/admin-block/LOS). | `orgId`, `listingId`, `ruleType`, `priority`, `startDate`/`endDate`, `priceOverride`/`priceAdjPct`, min/max overrides, block/CICO/suspend flags |
| **EngineRun** | Audit log of each pricing-engine run. | `orgId`, `listingId`, `startedAt`, `status` (SUCCESS/FAILED), `daysChanged`, `durationMs`, `errorMessage` |
| **MarketEvent** | Local events/holidays influencing demand. | `orgId`, dates, name, impact |
| **MarketTemplate** | Per-market reference config (global, no `orgId`). | `marketCode`, `displayName`, `country`, `currency`, `timezone`, seasonal patterns |
| **BenchmarkData** | Competitor/market benchmark snapshots. | `orgId`, market percentiles, ADR positioning |
| **Insight** | Generated analytics/insights. | `orgId`, type, payload |
| **ChatMessage** | Aria chat history. | `orgId`, `role`, `content`, `sessionId`, `context`, `metadata` |
| **GuestSummary** | AI summaries of guest conversations. | `orgId`, conversation ref, summary |
| **HostawayConversation** | Ingested guest message threads (from the Hostaway webhook). | `orgId`, `listingId`, `hostawayConversationId`, `guestName`, `messages[]`, `dateFrom`/`dateTo` |
| **DraftFeedback** | Feedback on AI-drafted guest replies. | `orgId`, draft ref, rating |
| **Source** / **SourceRun** / **Detector** | Data-source sync registry + run history + detectors. | sync config, run status |

## Notes

- **Prices** are numeric; the UI uses explicit `toLocaleString("en-US")` to
  avoid SSR hydration mismatches.
- **Connection** is cached on `global._mongooseCache` (serverless-safe) with
  `bufferCommands:false`.
- **Indexes:** `orgId` indexed on tenant collections; `InventoryMaster` has a
  unique `{ listingId, date }` index plus `{ orgId, proposalStatus }`.
- For the full pricing data flow (engine → proposals → execution), see
  `ARCHITECTURE.md` §5.
