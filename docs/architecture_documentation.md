# PriceOS Architecture & Data Flow Guide

> ⚠️ **Authoritative architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md).**
> This guide covers dashboard/agent-chat data flow only. Defer to
> `ARCHITECTURE.md` for the stack, security/multi-tenancy, and the pricing
> engine (now including the live elasticity + demand optimization layer). Stack
> is **MongoDB/Mongoose + custom JWT** — not Postgres/Drizzle.

This document provides a detailed breakdown of how data is retrieved, calculated, and presented across the two main surface areas of the PriceOS application: the **Dashboard** and the **Unified Agent Chat**.

---

## 1. Dashboard (KPIs, Charts, and Metrics)

The main dashboard provides a 30-day forward-looking snapshot of the portfolio's health. It is rendered via server-side data fetching in `app/(dashboard)/dashboard/page.tsx`, which passes merged data to the interactive client component in `app/(dashboard)/dashboard/overview-client.tsx`.

### **Data Retrieval (Server-Side)**
When a user loads the Dashboard, the server executes direct, unified SQL queries using **Drizzle ORM** against the PostgreSQL database:
1. **Listings**: Fetches all property metadata (area, name, bedrooms, base price).
2. **Calendar Master (`inventory_master`)**: Calculates 30-day metrics natively in SQL.
   - **Occupancy %**: `100 * booked / (total - blocked)`
   - **Average Price**: `AVG(current_price)`
   - **Total Revenue**: `SUM(current_price)` filtered to reserved/booked statuses.
3. **Reservations (`activity_timeline`)**: Extracts reservation records overlapping the next 30 days to derive channel-level financial data.

The server maps and merges these metrics to the individual `listings` objects, passing an enriched `properties` array to the `OverviewClient`.

### **UI Components & Calculations (Client-Side)**

The `OverviewClient` features a unified "Global Search" bar. When a user types a search query (e.g., an area like "Marina"), the `filteredProperties` array is calculated dynamically in real-time. Every KPI card and chart reactively recalculates based *only* on the filtered subset.

#### **1. KPI Cards**
- **Total Properties**: Count of properties matching the current search filter.
- **Avg Occupancy (%)**: Calculates the average numerical occupancy across the filtered properties (excludes properties with 0 occupancy from the average pool to prevent skewing).
- **Avg Daily Rate (AED)**: Aggregates the standard calculated average price per night across the matched properties.
- **Projected Revenue (AED)**: The direct sum of all projected 30-day revenue across the matched block.

#### **2. "Top Drivers by Revenue" (Bar Chart)**
- **Source Data**: The `filteredProperties` array.
- **Calculation**: Sorts properties descending by `.revenue` (the sum of 30-day booked revenue).
- **UI Interaction**: Includes a "Top N" dropdown (10, 20, 30, All) in the card header. The array is sliced based on the dropdown limit `slice(0, N)` before feeding into standard `recharts` BarChart components. 

#### **3. "Occupancy Rate by Property" (Bar Chart)**
- **Source Data**: The `filteredProperties` array.
- **Calculation**: Sorts properties descending by `.occupancy`.
- **UI Interaction**: Features a dynamic dropdown limit filter (Top 10, 20, All). Helps identify the highest performing properties vs. heavily vacant properties in the next 30 days.

#### **4. "Revenue By Area" (Pie Chart)**
- **Source Data**: Aggregation of `.area` metadata and `.revenue` across properties.
- **Calculation**: Iterates over `filteredProperties` and builds a cumulative sum in a dictionary grouped by the string value of `.area` (e.g., "Dubai Marina": 45000). Converts this map into an array sorted by value.
- **UI Interaction**: Uses a "Top N" dropdown to truncate small edge-case locations. Includes a color-coded flex-wrap Legend below the chart so users can perfectly identify geospatial revenue dominance.

#### **5. "Revenue By Channel" (Pie Chart)**
- **Source Data**: Financials embedded in `reservations`.
- **Calculation**: Iterates over all reservations assigned to the `filteredProperties`. Reads `financials.channelName` (normalizing string variants like "Airbnb", "Booking.com", "Direct") and accumulates `financials.hostPayout` into a dictionary. 
- **UI Interaction**: "Top N" dropdown. Highly distinct semantic colors are mapped to the standard OTAs (e.g., Red for Airbnb, Blue for Booking.com).

---

## 2. Unified Agent Chat (Context, Setup, & Execution)

The **Unified Agent Chat** (`unified-chat-interface.tsx`) is the central intelligence hub where the user interacts with the CRO Router Agent to manipulate pricing.

### **A. Core Context Switches**
The chat interface restricts and frames the AI's "working memory" based on user UI selections:
1. **Property Context**: Handled by a dropdown. Users select either "Portfolio View" or a specific "Listing".
2. **Date Context**: A rigid `DateRangePicker`.

**Real-Time Metrics Retrieval**:
When a property and date range are selected, the UI silently fires a `fetch('/api/calendar-metrics')` call. This server endpoint runs a targeted query on `inventory_master` strictly for the chosen listing/dates.
- It returns exact booked, blocked, available days, and occupancy %.
- These metrics are overlaid natively in the UI (top right "Occupancy & Avg Price" visual cards) so the user has immediate context *before* chatting.
- Crucially, these specific metrics are **injected directly into the system prompt** of the Agent when the user sends a message.

### **B. The "Setup" Phase (Market Research Retrieval)**
LLMs cannot simultaneously query the internet and return chat responses quickly. PriceOS solves this using an asynchronous *Setup* gate.

1. **Trigger**: When the user clicks the "Setup" button, `app/api/market-setup/route.ts` fires.
2. **Agent 6 (Marketing Agent)**: The backend invokes the standalone Marketing Agent (which uses Perplexity Sonar for live internet access). It is prompted to find all major events, holidays, and live competitor prices for the selected dates.
3. **Database Caching**: The API receives the agent's JSON, **wipes any previous temporary market data** for those dates, and writes the new intel directly into the `activity_timeline` Postgres table (tagged as `type = 'market_event'`).
4. **UI Activation**: Once the database is populated, the Chat interface visually unlocks (flips to "ON"), permitting the user to type messages.

### **C. The Chat Phase (Orchestration & Proposals)**
When the user types a message (e.g., "Should I lower prices due to the occupancy gap?"):

1. **Routing (`/api/chat`)**: The message is sent to **Agent 1 (CRO Router)**.
2. **Data Ingestion**: The CRO Router recognizes the request and silently queries its sub-agents:
   - **Market Research Agent**: Queries the exact `activity_timeline` events cached seconds ago during "Setup" and returns Price Multipliers based on event impact.
   - **Property Analyst / Booking Intelligence Agents**: Review historical gaps.
3. **Price Proposals & Safeguards**: 
   - The CRO Router generates an array of specific `proposedPrice` shifts.
   - It runs these through **Agent 5 (PriceGuard)**, which strictly enforces the `price_floor` bounds queried from the `listings` table.
4. **Delivery & Persistence**:
   - The final AI response contains both conversational text and structured JSON proposals.
   - The backend `POST /api/chat` router intercepts the JSON and **automatically saves the proposals to the `inventory_master` table** (with `proposalStatus = 'pending'`).
   - The UI intercepts the JSON and renders the pending changes into neat, actionable Tailwind cards inside the chat window.
5. **Approval**: When the user clicks "Approve", the `api/proposals/[id]/approve` route is hit, pushing the new price to the Hostaway Channel Manager syncing agent, and finally finalizing the new price in the database.
