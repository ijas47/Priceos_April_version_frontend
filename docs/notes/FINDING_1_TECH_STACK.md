# Finding 1: Tech Stack & Database Divergence

This document analyzes the fundamental differences in infrastructure and database architecture between **Original PriceOS (v1)** and **PriceOS 2.0 (v2)**.

## 💾 Database Architecture Comparison

| Feature | PriceOS v1 (Original) | PriceOS v2 (modern) | Impact |
| :--- | :--- | :--- | :--- |
| **Database Provider** | **Neon** (Postgres Serverless) | **Supabase** (Postgres) | V2 is optimized for Supabase-level security (RLS). |
| **Auth Provider** | **Neon Auth** (`@neondatabase/auth`) | **Supabase Auth** (`@supabase/ssr`) | Migration requires a total auth strategy swap. |
| **ORM** | Drizzle ORM | Drizzle ORM | **Consistent** — Schema definitions can be ported easily. |
| **State Management** | Zustand (Global) | Zustand + **TanStack React Query** | V2 uses React Query for 15+ complex data hooks. |
| **AI Integration** | None / Manual | **Vercel AI SDK** (`ai`, `@ai-sdk/openai`) | V2 uses a robust prompt-tool execution pipeline. |

---

## 🏗️ Multi-Tenancy Architecture (B2B Focus)

### v1 (Individual-Focused)
- Users are isolated entities.
- Every table has a `user_id` column.
- Schema is built for a single property owner profile.

### v2 (Organization-Focused)
- **`organizations`** is the master table.
- Every single tenant table has an **`org_id`** column (denormalized).
- **Row Level Security (RLS)**: Queries are automatically scoped to the user's organization (`getOrgId()`).
- Supports **Team Invites** and role-based access control (RBAC).

---

## 🛠️ Tech Stack Delta

To bring v2 features to v1, we must install these missing packages in the v1 `package.json`:
- `@tanstack/react-query`: For server-state asynch synchronicity.
- `ai`, `@ai-sdk/openai`: For the new Insight and Assistant logic.
- `@supabase/ssr`: If we decide to swap the Auth engine.
- `shadcn` / `Tailwind v4`: To align the UI with the v2 design system.

---
**Conclusion**: Rebuilding v1 with v2 features requires moving from a "User-based" schema to an "Organization-based" schema.
