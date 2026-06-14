# Finding 3: AI Pipeline & Intelligence (L1-L3)

This document analyzes the sophisticated **Intelligence IQ** layer in **v2 (Modern)** compared to the static automation in **v1 (Original)**.

---

## 🛠️ v2 Architecture: The 3-Layer Pipeline

v2 implements a **Modular IQ Pipeline** that handles data-to-decision logic.

| Layer | Component | Function |
| :--- | :--- | :--- |
| **L1: Sources** | `sources` table | Pulls raw data from Hostaway, Market, Events. |
| **L2: Detectors** | `detectors` table | Analyzes source data for "Signals" (e.g., Pace Up). |
| **L3: Insights** | `insights` table | LLM-powered agent generates plain-text suggestions. |

**In v1 (Original)**:
- Automation is **hardcoded**.
- If a "Last Minute" rule is ON, it just applies.
- No "Intelligence" layer to *suggest* enabling or disabling a rule based on market-wide signals.

---

## 🏗️ The Pricing Waterfall Engine

v2 introduces a **Deterministic Pricing Waterfall**. Instead of calculating a single price, it calculates a sequence of **Steps**.

### v2 Waterfall Logic (Engine)
1. **Base Price** (e.g., $450)
2. **Strategy Application**:
   - Apply "High Season" (+15%) $\rightarrow$ $517.50
   - Apply "Ramadan Discount" (-10%) $\rightarrow$ $465.75
3. **Guardrails**:
   - Floor: $400, Ceiling: $1000.
4. **Output**: Detailed JSONB `waterfall` record.

### Why v1 is Missing This:
- v1 performs **"direct price computation."** It doesn't store the "reasoning" or "steps" that led to a final price.
- To port this, we need to rebuild the **`PricingEngine`** class in v1 to return a **`PricingRun`** object with line-item steps.

---

## 🤖 AI Logic & Tooling

v2 uses the **Vercel AI SDK** with OpenAI/OpenRouter to perform **Tool Calling**.

- **Insight Agent**: Can "call" the database to check occupancy and "call" the engine to simulate price changes.
- **v1 lacks this "Agentic" capability**. v1 uses AI primarily for chat completion and fixed summarization.

---
**Conclusion**: Rebuilding v1 with v2 intelligence requires implementing the **`lib/pipeline`** and **`lib/engine`** packages, which act as the brain of the platform.
