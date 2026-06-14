# Changelog

Notable changes to PriceOS. Newest first.

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
