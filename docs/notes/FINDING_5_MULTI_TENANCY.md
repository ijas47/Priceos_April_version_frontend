# Finding 5: Multi-tenancy & Organization Scope

This document analyzes the fundamental shift from a **single-user app (v1)** to a **B2B Multi-tenant platform (v2)**.

---

## 🏢 v1: Individual-Person Perspective

In v1, the data model is built around a single "User" who owns everything.
- **Table Structure**: Tables like `user_settings` and `chat_messages` link directly to a `user_id`.
- **Security**: Security is handled at the API layer (Next.js middleware).
- **Scale**: It is difficult to add "Team Members" (e.g., an Analyst and a Manager) who share access to the same property portfolio.

---

## 🏗️ v2: Organization-First Architecture

v2 is built as a **B2B SaaS platform**. The primary entity is the **`organization`**.

### 1. The Denormalized `org_id`
Every single tenant table in v2 (Listings, Strategies, Insights, Conversations) has an **`org_id`** column.
- This allows for **Row Level Security (RLS)** in Supabase.
- A user's session is mapped to an `org_id`, and all database queries are automatically filtered:
  ```sql
  SELECT * FROM listings WHERE org_id = 'user_org_id()';
  ```

### 2. Team Collaboration
v2 supports multiple users per organization:
- **Roles**: Owner, Admin, Manager, Viewer.
- **Invites**: A `team_invites` table for onboarding new members safely.
- **Audit Logging**: Every action is stamped with both an `org_id` and a `user_id`, allowing you to see *who* changed a strategy for the team.

---

## ⚙️ Org-Level Configuration

v2 introduces the concept of **"Org Settings"** (stored as JSONB in `organizations.settings`).
- **`pricingAutomation`**: Master toggles for the entire company.
- **`maxPriceChangePct`**: Threshold for auto-approving suggestions.
- **`allowedActions`**: Reforming the "Scope" of what the AI is allowed to do for this specific company.

---

## 📐 Migration Impact

To move v1 to this model, we must:
1.  **Add `org_id`** to every table in the v1 `schema.ts`.
2.  **Create an `organizations` table**.
3.  **Update all queries/hooks** to filter by `org_id`.
4.  **Refactor Auth**: Transition from Neon's user-centric auth to Supabase's organization-ready auth.

---
**Conclusion**: Rebuilding v1 to v2 standards requires an "Inside-Out" refactor of the security and data isolation model.
