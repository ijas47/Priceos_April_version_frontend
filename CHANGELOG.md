# Changelog

Notable changes to PriceOS. Newest first.

## Unreleased — Demand-aware pricing, PMS sanity, market data split

### Market data (Dubai local + Airbtics)
- **Dubai local data kept for UAE seasonal anchors.** Ingested AirROI Kaggle
  dataset (`DubaiMarketMonthly`, `DubaiCompListing`) supplies per-month p25/p50/p75
  and geo comp percentiles — the UAE demo wedge (e.g. Marina summer vs winter).
- **Airbtics owns live forward demand when `AIRBTICS_API_KEY` is set.**
  `mergeMarketSignals()` in `dubai-airroi.ts`: Dubai wins `monthAnchorAdr` and
  comp percentiles; Airbtics wins `forwardOccupancy`, `pacingAdr`, and live market
  occupancy. Dubai pacing is **fallback only** when Airbtics is off or missing a date.

### PMS listed price validation
- **`listing-price-sanity.ts`** compares Hostaway listed/calendar rates to TTM
  achieved ADR and market p50; detects flat placeholder defaults (100/500 AED).
- Persists on `Listing`: `validatedBasePrice`, `basePriceSource`, `basePriceConfidencePct`,
  `pmsPriceTrusted`, `basePriceValidatedAt`.
- Runs on auto-setup; emits `Insight` (`detectorKey: listing_price_sanity`) when unreliable.
- Pipeline uses `resolvePipelineListedPrice()` — ignores flat wrong calendar when untrusted.

### Demand regime (distressed summer / crisis)
- **`demand-regime.ts`** classifies `distressed | soft | normal | strong` from
  forward occupancy, portfolio occupancy, booking pace vs STLY, crisis tier, and
  Gulf summer trough (Jun–Sep).
- **Distressed behavior:** scales market anchor toward listed price (~42% blend),
  suspends comp p25 floor guard, skips month p25 floor lift, caps integrity clamp
  to `listed × 1.12` — stops chasing historical p50 when demand has collapsed.
- **Aria chat** injects `demand_regime`, `pricing_directives`, and rewrites benchmark
  verdict to `DEFENSIVE_HOLD` in distressed markets; mandates `engine_proposals` as
  authoritative recommended price.

### Tests
- `demand-regime.test.ts`, `listing-price-sanity.test.ts`, expanded `dubai-airroi.test.ts`
  (merge policy + pacing ownership).

---

## Unreleased — Pricing intelligence overhaul

### Pricing engine
- **Month-first market anchor.** Dynamic weights (`anchor-weights.ts`): when
  monthly market ADR exists, 50% month p50 + month-specific comp percentiles;
  listed Hostaway price reduced to 5% reference weight.
- **Per-day seasonal comps.** Dubai and Airbtics signals now use **that month's**
  p25/p50/p75 per calendar day (not one static TTM median for the full horizon).
- **Unified seasonality.** UAE calendar switches tactical profiles only;
  legacy `[UAE]`/`[Auto]` `SEASON` `priceAdjPct` rules removed on pack apply and
  filtered from engine runs when month-first anchor is active.
- **Strategy on every run.** `pricingStrategy` presets (LM, far-out, gap-fill,
  DOW) re-applied inside `runPipeline` — not only at portfolio setup.
- **Monthly guardrail bands.** Floor/ceiling derived from month market p25/p75 ×
  strategy `floorMult`/`ceilingMult` (Dubai 100 vs 1000 swing).
- **Event pricing in pipeline.** Cached `MarketEvent` rows apply capped uplifts
  via shared `event-pricing.ts` (same logic as Event Intelligence agent).
- **Proposal guardrails enforced.** `maxSingleDayChangePct` caps daily moves;
  `autoApproveThreshold` sets `proposalStatus="approved"` for small deltas.

### Tests
- New unit tests: `proposal-guardrails`, `event-pricing`, `strategy-runtime`;
  updated `market-anchor` expectations.

### Lyzr agents (demo latency)
- **CRO Router:** Claude Sonnet → **Gemini 3 Flash** (synced to Lyzr Studio).
- **Workers:** Property/Booking/Market → **Gemini 3.1 Flash Lite**.
- **Safety:** PriceGuard + Guardrails → **gpt-4o-mini** (temp 0).
- Capped `maxTokens` on chat-facing agents for faster turns.

### Docs
- `docs/ARCHITECTURE.md` — pricing engine sections 5 (layers 0–C, strategy table).
- `docs/agent-call-reference.md` — engine data flow updated.

---

## Unreleased — Security hardening, revenue optimization & docs

### Security
- **JWT signatures verified at the edge.** `middleware.ts` now verifies the
  HS256 signature with `jose` (algorithm-pinned) instead of only decoding the
  token — forged sessions are rejected.
- **Multi-tenant isolation enforced.** Added `orgId` scoping to routes that
  previously read/mutated tenant data without an ownership check: `db-viewer`,
  `proposals/[id]/approve`, `v1/properties`, `chat/history`,
  `listings/[id]/run-engine`, `listings/[id]/engine-config`, `v1/guests/reply`,
  `v1/guests/conversations`.
- **Secrets removed & guarded.** Purged committed credentials (`keys.txt`,
  hardcoded values in `seed_data.py`); added `scripts/check-secrets.sh` run in
  CI; documented rotation in `SECURITY.md`.
- **Dependency bump.** Next.js 15.3.8 → 15.5.19 (middleware-bypass + postcss
  advisories) and resolved the lodash advisory.

### Revenue optimization (new)
- **Elasticity + demand pricing is live.** `runPipeline` now fits a logistic
  booking-probability model on each listing's history and blends the
  revenue-optimal price with the rulebook waterfall — confidence-weighted,
  demand-modified (±15%), capped to ±25% of the rulebook price, and hard-clamped
  to floor/ceiling. New module `src/lib/engine/optimization.ts`.
- **Gated by `ELASTICITY_PRICING`** (default on; `off` = shadow mode). Each day
  records `elasticityPrice` / `elasticityWeight` / `pBook`.
- **Pricing page** shows the rulebook-vs-optimized comparison + a legend.

### Resilience & correctness
- Hostaway client: 20s request timeout + bounded 429 retries (was unbounded
  recursion). Lyzr proxy: 60s timeout. Elasticity `pBook`: divide-by-zero guard.

### UX
- **Aria auto-primes** on the first message (market scan + guardrails); removed
  the manual "Run Aria" activation step and the OFFLINE toggle.

### Tooling & docs
- **Vitest test suite** (pricing guardrail invariant, optimizer safety, JWT
  forgery rejection, elasticity guards) wired into CI
  (secret-scan → lint → typecheck → test → build at repo root; CI previously ran
  in a non-existent `app/` dir).
- Removed dead Neon/Drizzle stack and stale `*.ts.old` files.
- Docs reconciled: new `docs/ARCHITECTURE.md` (canonical) and
  `docs/PriceOS-Product-Playbook.md`; `database_schema_documentation.md`
  rewritten for MongoDB; `CLAUDE.md` stack note; historical decks bannered.
