# Finding 2: Schema Maturity & Strategy Models

This document analyzes the fundamental shift in how pricing logic is stored and executed between **v1 (Original)** and **v2 (Modern)**.

---

## 📈 v1: Property-Centric Rules (Static)

In v1, pricing logic is baked directly into the **`listings`** table as boolean flags and numeric columns.

### Code Sample (v1 Listings Table)
```typescript
export const listings = pgTable("listings", {
  // Hardcoded strategy columns
  lastMinuteEnabled: boolean("last_minute_enabled"),
  farOutEnabled: boolean("far_out_enabled"),
  dowPricingEnabled: boolean("dow_pricing_enabled"),
  gapFillEnabled: boolean("gap_fill_enabled"),
  // ... parameters for each
});
```

**Limitations**:
1. **Low Flexibility**: You can't have multiple overlapping "Last Minute" rules with different parameters.
2. **Global scope**: Rules are property-specific and hard to share across "Areas" or "BHK types."
3. **Rigid Engine**: The pricing calculator is hardcoded to look for these specific columns.

---

## 🏗️ v2: Strategy-Centric Models (Modular)

In v2, all pricing logic has been extracted into a dedicated **`strategies`** table. This is the **"Strategy Engine"** architecture.

### Code Sample (v2 Strategy Table)
```typescript
export const strategies = pgTable("strategies", {
  id: varchar("id").primaryKey(),
  orgId: uuid("org_id").references(() => organizations.id),
  name: varchar("name").notNull(),
  enabled: boolean("enabled").default(true),
  // Dynamic scope (Global, Group, or Property)
  scope: varchar("scope").default("global"),
  groupId: integer("group_id"),
  // Flexible conditions & effects
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  priceAdjPct: numeric("price_adj_pct"),
  isBlocked: boolean("is_blocked").default(false),
  // ... more filters
});
```

**Advantages**:
1. **Multi-Rule Overlap**: You can apply a "Weekend Markup" AND a "Ramadan Season" strategy simultaneously.
2. **Market Groups**: A single strategy can be applied to all "2BR" apartments or everything in "Dubai Marina."
3. **Audit Trail**: Every change to a strategy is tracked in **`strategy_changelog`**.

---

## 📐 Schema Mapping for Migration

To migrate v1 to v2 logic, we must perform a **Data Transformation**:

| v1 Listing Column | v2 Equivalent Action |
| :--- | :--- |
| `lastMinuteEnabled = true` | Create a **`strategy`** with `leadTimeMax = N`. |
| `dowPricingEnabled = true` | Create a **`strategy`** with `daysOfWeek = [5,6]`. |
| `basePrice` | Remains in **`listings`** as the anchor. |
| `priceFloor` / `priceCeiling` | Ported to **`listings`** for guardrails. |

---
**Conclusion**: Rebuilding v1 with v2 excellence requires deleting the strategy columns from `listings` and implementing a robust `strategies` table and engine.
