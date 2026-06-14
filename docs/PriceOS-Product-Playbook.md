# PriceOS — Product & Sales Playbook

> The single source of truth for presenting and selling PriceOS. Everything
> here is grounded in what is **actually built** in the codebase as of this
> revision. Where something is roadmap (not yet built), it is labelled
> **[Roadmap]** so you never over-claim in front of a sharp buyer.
>
> **Golden rule when presenting:** sound confident on what exists, be candid
> on what's next. Buyers trust founders who know their own edges.

---

## 0. The 90-second pitch (memorize this first)

**One-liner:**
> "PriceOS is an AI revenue manager for short-term-rental operators in Dubai. It
> watches the market, your bookings, and local events, and proposes the
> profit-maximizing nightly price for every property and every night — and a
> human approves before anything goes live."

**The three soundbites (say one, depending on who's listening):**

1. *For an operator:* "It's like hiring a full-time revenue analyst for all your
   units, that never sleeps, explains every decision, and never changes a price
   without your sign-off."
2. *For a technical/AI buyer:* "It's an agentic system — a manager agent, Aria,
   orchestrating specialist agents — sitting on top of a deterministic pricing
   engine with a learned price-elasticity model. The AI is the brain; the
   guardrails are non-negotiable code."
3. *For an investor:* "Dynamic pricing is proven to lift STR revenue
   double-digits. We're building the Dubai-native, agent-driven, explainable
   version with a human-in-the-loop trust model — starting where the incumbents
   are weakest: local event intelligence and operator trust."

**The problem in one sentence:**
> "Operators running 15–50 units leave money on the table because they can't
> re-price hundreds of property-nights every day against events, competitors,
> and booking pace — and the tools that do it are black boxes they don't trust."

---

## 1. Product fundamentals

**Q: What is PriceOS, in plain terms?**
A revenue-management platform for Dubai short-term-rental (Airbnb/Booking.com)
property managers. It ingests signals (market rates, your calendar/bookings,
local events), runs a pricing engine, and surfaces **price proposals** that a
human reviews and approves. Approved changes can sync to the property management
system (PMS). It also includes a guest-messaging inbox with AI-drafted replies.

**Q: Who is it for?**
Property managers / co-hosts running roughly **15–50 units** in Dubai. Big
enough to feel the pain of manual pricing, small enough not to have an in-house
revenue team.

**Q: Why now?**
- Dubai STR supply is exploding; static or gut-feel pricing is leaving revenue
  on the table.
- LLMs/agents finally make it possible to *explain* pricing decisions
  conversationally, which is what unlocks operator trust.
- PMS APIs (Hostaway etc.) make ingestion and execution feasible.

**Q: What does the user actually see/do day to day?**
Open the dashboard, ask Aria (the AI copilot) a question or run the engine, get
a list of price proposals per night with the reasoning and a risk badge,
approve/reject in bulk or per-night, and (when enabled) push to the channel.
Plus: manage properties, view the calendar, reservations, market intel, a guest
inbox, analytics, and a backtest tab.

---

## 2. How it works (the flow)

**Q: Walk me through what happens end to end.**
1. **Connect** — operator connects properties (via Hostaway, or seeded data for
   the pilot). Each property gets a price floor/ceiling guardrail.
2. **Observe** — the engine pulls market signals (Airbtics market data),
   booking pace from the calendar, and local events.
3. **Propose** — the pricing engine computes a recommended price for each of the
   next 365 nights per property, with a written reason and a change %.
4. **Review** — proposals land in the Pricing page. The operator approves or
   rejects (per-night or bulk). Risk is classified (low/medium/high) by size of
   change.
5. **Execute** — approved changes can be pushed to the PMS — **but only if the
   system is explicitly taken out of read-only mode** (off by default).
6. **Verify** — the channel-sync step confirms the change landed.

**Q: How often does it re-price?**
The engine runs on demand (operator trigger / "run engine") and is designed for
daily cycles. It computes a full 365-day horizon each run.

**Q: Is this just ChatGPT with a prompt?**
No — and this is important. The *prices* come from a **deterministic engine**
(explicit, auditable math), not from an LLM guessing numbers. The LLM/agents
handle orchestration, explanation, research, and conversation. An LLM never
invents a price that bypasses your floor/ceiling.

---

## 3. The AI: Aria and the agent team

**Q: What is Aria?**
Aria is the **CRO (Chief Revenue Officer) agent** — the manager/copilot you talk
to. It orchestrates the specialist worker agents, answers questions, and
presents proposals. It's built on the Lyzr agent framework (manager–worker
pattern).

**Q: What are the worker agents?**
Specialists, each with a narrow job (orchestrated by Aria):
- **CRO Router** — routes your request to the right specialist.
- **Property Analyst** — analyzes a property's pricing/occupancy.
- **Booking Intelligence** — reads booking pace / velocity.
- **Market Research / Internet Research** — scans for events, holidays,
  competitor rates.
- **Competitor Benchmark** — market percentiles and price positioning.
- **PriceGuard / Guardrails agent** — sets/validates floor & ceiling.
- **Marketing, Conversation Summary, Chat Response** — guest-inbox + content.

**Q: Why an agent architecture instead of one big model?**
Separation of concerns and safety: each agent does one thing, only the manager
(Aria) speaks to the user, and **only the channel-sync path can write to the
PMS**. Workers never execute autonomously. This is what makes the system
auditable and safe.

**Q: When I ask Aria a question, what happens?**
On your first question for a property + date range, Aria **auto-primes**: it
scans market events, benchmarks competitors, and (if needed) auto-sets
guardrails — then answers. (We removed the old "Run Aria" button; you just ask
and it works.)

---

## 4. The pricing science (the part that wins technical buyers)

**Q: How is the price actually calculated?**
A layered pipeline. Think of it as a **deterministic rulebook**, then a **learned
optimization layer**, always inside **hard guardrails**:

**Layer A — the 4-pass waterfall (deterministic):**
1. **Market anchor** — adjust the base price for seasonality (this month's
   market median vs the annual median) and forward demand (occupancy pace).
   Multipliers are capped (e.g. 0.5×–2.0×) so bad data can't wreck pricing.
2. **Foundation / rules** — apply the operator's seasonal & event rules.
3. **Strategy** — last-minute discounts, far-out premiums, day-of-week pricing.
4. **Inventory / gaps** — fill awkward 1–2 night gaps between bookings.
5. **Integrity** — clamp to floor/ceiling, enforce min-stay, round.

**Layer B — revenue optimization (learned):** *(newly wired in & live)*
- A **price-elasticity model** learns from each property's own booking history:
  "at price X this night books with probability P." It's logistic regression fit
  with IRLS (the standard method), cold-started with sensible Dubai defaults when
  data is thin.
- It then finds the **revenue-maximizing price** (price × booking-probability)
  via golden-section search, within the floor/ceiling band.
- It's **confidence-weighted**: with little booking history the model's weight is
  ~0, so the output equals the rulebook price. As bookings accumulate, the model
  earns more weight. *(This is why early on it looks conservative — by design.)*
- A **source-market demand modifier** nudges price based on where guests come
  from and seasonal demand, bounded to ±15%.

**Layer C — guardrails (non-negotiable):**
- Final price is **clamped to each property's floor/ceiling**, always.
- Optimization can't move a price more than **±25%** from the rulebook price in
  one run (stability / trust).
- Every day carries a written **reasoning** string and a change %.

**Q: So is the "AI optimization" real, or marketing?**
Real and live. The elasticity + demand layer now drives proposed prices (it used
to be dormant — we connected it). And it's honest: it only diverges from the
rulebook as it earns confidence from real booking data.

**Q: What if the model has no data (brand-new property)?**
It cold-starts on conservative Dubai market defaults and leans on the
deterministic rulebook (model weight ≈ 0). It degrades gracefully — never wild.

**Q: Can you explain why it set a given price?**
Yes — every proposal stores a human-readable reason (e.g. "[MARKET] Seasonality
+30%… [STRATEGY] far-out premium… [CLAMP] capped at ceiling"). Explainability is
a core differentiator vs black-box tools.

---

## 5. Safety, trust & control (the objection-killer section)

**Q: Will it change my prices without me knowing?**
**No.** Three independent locks:
1. **Human-in-the-loop** — proposals require explicit approval (per-night or
   bulk). Nothing executes on its own.
2. **Read-only by default** — pushing prices to the channel manager is blocked
   unless someone deliberately sets `HOSTAWAY_READ_ONLY=false`. Today it is
   **true** — zero prices are pushed anywhere.
3. **Guardrails** — even an approved, pushed price can never exceed your
   floor/ceiling.

**Q: What's the "state machine" I see referenced?**
Operations move through states — **Connected → Observing → Simulating → Active →
Paused**. Execution is only possible in *Active*, and *Paused* requires a human
to resume. It's a deliberate ramp so trust is earned before automation.

**Q: What if it makes a bad recommendation?**
You simply don't approve it. And the ±25% shift cap + floor/ceiling clamp bound
the worst case. We optimize for "never embarrassing," not "always perfect."

**Q: Does it message my guests automatically?**
No. The guest inbox drafts AI replies, but outbound sending is **separately
gated** (`HOSTAWAY_ALLOW_GUEST_SEND`, off by default). Replies stay as drafts
until a human sends them.

---

## 6. Integrations & data

**Q: What does it integrate with?**
The PMS layer is abstracted (a clean `PMSClient` interface) with three modes:
- **mock** — demo data (5 Dubai properties) for trials,
- **db** — our MongoDB as source of truth,
- **live** — Hostaway API. **[Partially built]** Reads work in read-only mode;
  live price *push* is gated and being validated against live credentials.

**Q: Why Hostaway first?**
It's a dominant PMS for the segment and its field names map cleanly. The
abstraction means adding Guesty/others later doesn't touch application code.
**[Roadmap]** other PMS adapters.

**Q: Where does market data come from?**
Airbtics market intelligence (market median rates, occupancy pacing,
percentiles) plus internet/event research via the agents.

**Q: What data do you store / train on?**
Per-tenant: properties, calendar/inventory, reservations, proposals, chat
history, guest conversations, market/benchmark data. The elasticity model trains
**only on that tenant's own booking history** — no cross-tenant data mixing.

---

## 7. Security & multi-tenancy (for the IT/security buyer)

**Q: Is my data isolated from other customers?**
Yes. Every tenant is an "organization" (`orgId`). Every database query is scoped
by `orgId`, and the API enforces it. We recently hardened this end-to-end.

**Q: How do you authenticate?**
Custom JWT (HS256) in httpOnly cookies, with **cryptographic signature
verification at the edge** (algorithm-pinned to block forgery) and per-route
authorization. Sessions can't be forged by tampering with a token.

**Q: How do you handle secrets?**
All credentials live in environment variables (Vercel), never in source. CI runs
an automated **secret scanner** that fails the build if a credential is ever
committed. *(Candid note: early prototype secrets were rotated and a scanner
added so it can't recur.)*

**Q: Where is it hosted?**
Vercel (app) + MongoDB (Atlas/DocumentDB). Serverless, scales with load.

---

## 8. Reliability & engineering quality

**Q: How do I know it won't fall over?**
- External calls (Lyzr agents, Hostaway) have **timeouts and bounded retries** —
  a hung third party can't hang the app.
- Pricing math has **guards** against divide-by-zero / bad data.
- A **CI pipeline** runs secret-scan → lint → typecheck → tests → build on every
  change; nothing merges red.
- A **test suite** pins the critical invariants (prices always stay within
  guardrails, auth rejects forged tokens, the optimizer collapses safely with no
  data).

**Q: What's your test philosophy?**
We test the things that move money or break trust: the floor/ceiling guarantee,
the auth boundary, and the optimizer's safety properties. That's the 20% that
covers 80% of the risk.

---

## 9. Competition & differentiation

**Q: How is this different from PriceLabs / Beyond / Wheelhouse / DPGO?**
Those are strong, established dynamic-pricing tools. We're differentiating on:
1. **Agentic + conversational** — you *talk to* Aria and get explained
   reasoning, not just a price grid.
2. **Dubai-native event intelligence** — local events, holidays, seasonality
   tuned for this market, where global tools are generic.
3. **Explainability + trust model** — written reasons per night, risk
   classification, human-in-the-loop, read-only-by-default.
4. **Operator-grade guardrails** — hard floor/ceiling and shift caps as code,
   not suggestions.

**Q: Honestly, what do they do better than you today?**
They have scale, more PMS integrations, years of data, and proven track records.
We're earlier. Our bet is the Dubai focus + agentic explainability + trust wins
the operators those tools under-serve. *(Saying this honestly builds credibility.)*

**Q: What's the moat?**
Per-tenant booking-history data compounding into better elasticity models, the
Dubai event/market knowledge base, and the trust/workflow lock-in once an
operator runs daily cycles through Aria.

---

## 10. Business model & ROI

**Q: How does dynamic pricing make me money?**
Two levers: raise rates when demand is high (events, peak season, tight pace) and
lower/structure them to fill gaps and avoid empty nights. Industry studies of
dynamic pricing commonly cite **double-digit revenue/RevPAR uplift** vs static
pricing — *frame this as an industry benchmark, and offer to measure the
customer's actual lift in a pilot* (don't quote a number as a PriceOS-proven
result yet).

**Q: How will you price the product? [Roadmap / decide]**
Typical models in the space: % of incremental revenue, per-unit/month SaaS, or a
hybrid. *(Have a number ready before a sales meeting; flag it as your decision.)*

**Q: How do you prove ROI to a skeptical operator?**
The **backtest** tab replays the engine over history, and shadow mode records the
optimizer's price next to the current one so they can see the delta before
trusting it. Run a pilot, measure RevPAR/occupancy lift on their own units.

---

## 11. Roadmap & honest limitations

**Be ready to say these plainly — knowing your gaps is a strength.**

- **Customers:** pre-revenue / pilot stage. The current Hostaway connection is a
  partner's account used in read-only mode for MVP validation. *(Frame: "we're
  in design-partner mode, validating with real inventory before charging.")*
- **Live PMS push:** built but gated; being validated against live credentials
  before enabling. Read-only today by intention.
- **Elasticity model:** live and guardrailed, but most valuable once each
  property has a few months of booking history; early on it's conservative.
- **Markets:** Dubai-first (and a London source-market profile exists). Other
  cities are roadmap.
- **One known item:** the live-chat WebSocket currently exposes a shared agent
  key to the browser — slated to move to a scoped token. *(Only mention if asked
  a deep security question.)*
- **[Roadmap]:** more PMS integrations, automated daily scheduling, richer
  analytics, billing.

---

## 12. Hard / curveball questions (rapid-fire answers)

**"Is this just a wrapper around an LLM?"**
No. Prices come from deterministic, auditable math with hard guardrails. The LLM
orchestrates, researches and explains — it never sets a price that escapes your
floor/ceiling.

**"What stops it from doing something crazy?"**
Three layers: human approval, read-only-by-default execution, and code-level
guardrails (floor/ceiling + ±25% shift cap). The worst case is a proposal you
decline.

**"You have no customers — why should I believe it works?"**
Fair. That's why we run pilots in read-only/shadow mode on your own units and
show you the recommendations and backtest before a dirham moves. You risk
nothing to evaluate it.

**"How is your AI better than a spreadsheet of rules?"**
Rules are static; our elasticity model *learns your demand curve* and finds the
revenue-maximizing price, while still respecting your rules as guardrails. And
it explains itself.

**"What if Airbtics / Lyzr / Hostaway goes down?"**
The engine degrades gracefully — missing market data falls back to base pricing,
external calls time out instead of hanging, and nothing is pushed without
approval. No single dependency can misprice or freeze the system.

**"Who can see my data?"**
Only you. Strict per-tenant `orgId` isolation on every query, signed-session
auth, secrets in env only. Your booking history trains only your model.

**"What's your unfair advantage?"**
Dubai-native market/event intelligence + an agentic, explainable, trust-first
workflow + compounding per-operator data. We win the operators black-box tools
can't earn trust with.

**"Can it work outside Dubai?"**
The architecture is market-agnostic (a London profile already exists); we're
Dubai-first by focus, not by limitation. Expansion is a data/config exercise.

**"How accurate is the pricing?"**
It's bounded and explainable rather than magically precise. It improves with each
property's booking history, and you always have the final say. We optimize for
trustworthy and never-embarrassing over a black-box "trust me."

**"Did you build this yourself / with AI?"**
Yes — built efficiently with AI-assisted development and an AI product manager,
which is exactly the leverage we're selling. The engineering has tests, CI, and
security hardening behind it. *(Own this — it's a strength, not a weakness.)*

---

## 13. Cheat-sheet: numbers & terms to have on instant recall

| Thing | The number / fact |
|------|-------------------|
| Target customer | Dubai STR operators, **15–50 units** |
| Pricing horizon | **365 days** computed per run |
| Pricing passes | **4-pass waterfall** + optimization + guardrails |
| Seasonality multiplier cap | **0.5×–2.0×** |
| Optimizer shift cap | **±25%** from rulebook price per run |
| Demand modifier cap | **±15%** |
| Model full-confidence at | **~30 bookings** of history |
| Floor/ceiling | **Always enforced** (hard clamp) |
| Execution default | **Read-only — no channel pushes** |
| Guest sending default | **Off — drafts only** |
| Auth | Signed JWT (HS256), per-tenant `orgId` isolation |
| Manager agent | **Aria** (CRO) on Lyzr manager-worker |
| PMS | **Hostaway** first, abstracted for others |
| Market data | **Airbtics** + agent event research |
| State machine | Connected → Observing → Simulating → Active → Paused |

**Three things to never get wrong on stage:**
1. We **never push prices without human approval** (and it's read-only by default).
2. The **price comes from math with hard guardrails**, not an LLM guess.
3. We're **pilot-stage and honest about it** — that's why evaluation is risk-free.
</content>
