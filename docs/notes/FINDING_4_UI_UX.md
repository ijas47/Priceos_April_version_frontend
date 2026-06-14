# Finding 4: UI/UX & Component Library

This document analyzes the visual and technical evolution of the frontend between **v1 (Original)** and **v2 (Modern)**.

---

## 🎨 UI/UX Evolution: From Radix to Unified shadcn

v1 and v2 use **React 19** and **Next.js 16**, but their approach to component architecture has diverged significantly.

| Feature | PriceOS v1 (Original) | PriceOS v2 (modern) |
| :--- | :--- | :--- |
| **Component Library** | Individual `@radix-ui` packages | **shadcn/ui** (Unified Radix implementation) |
| **Design Tokens** | Semi-custom Tailwind config | **Tailwind CSS v4** (CSS-first design system) |
| **Theme** | Multi-theme support | **Always-Dark** (Cyber-luxury aesthetic) |
| **Interactive Icons** | Lucide React | Lucide React + **Solar Custom Icon Set** |

---

## 🏢 Portfolio vs Focus Modes

v2 introduces a major UX innovation: **Portfolio-Level Management**.

1. **Focus Mode (Listing-Level)**:
   - Managing a single property's calendar and pricing.
   - **v1 matches this well.**

2. **Portfolio Mode (Group-Level)**:
   - Managing an entire "Area" (e.g., Dubai Marina) or "Portfolio" at once.
   - **v1 lacks this "Group" management UI.** Porting this requires implementing the `SearchFilterList` and `GroupActionToolbar` from v2.

---

## 📊 Component Logic: React Query Integration

A key "invisible" feature in v2 is the use of **TanStack React Query**.

- **v1 (Zustand)**: Relies on manual `useEffect` or state setters to fetch and store data.
- **v2 (React Query)**: Uses **15+ custom hooks** for caching, optimistic updates, and automatic re-refetching (e.g., `useProperties`, `useStrategies`, `useInsights`).

**Migration Difficulty**: High. Bringing v2's React Query hooks into v1 requires wrapping the app in a `QueryClientProvider` and rewriting the data-fetching layer.

---

## 🏗️ Rebuilding the "Insight Feed"

The "Insight Feed" in v2 is the centerpiece of the user experience.
- It is a **"Stacked Card"** system that mimics a social media feed.
- Each "Insight" has an interactive **"Modify & Approve"** dialog.
- **To implement this in v1**, we must port the `InsightCard.tsx`, `InsightDialog.ts`, and the supporting `staged_price_changes` schema.

---
**Conclusion**: Rebuilding v1 to v2 standards requires adopting modern Design System principles (shadcn) and a declarative data-fetching layer (React Query).
