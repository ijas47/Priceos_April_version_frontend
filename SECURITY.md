# Security & Secret Rotation Runbook

## ⚠️ Leaked credentials — action required

Live credentials were previously committed to the repository (in `keys.txt`
and `seed_data.py`). They have been **removed from the working tree** and a CI
secret scan (`npm run scan:secrets`) now blocks any re-introduction. However,
**anything ever committed must be treated as compromised** — it still exists in
git history (commit `7a3c9bb`) and may have been copied while public.

**Rotating the secrets in the upstream services is the only thing that truly
neutralizes the exposure. This must be done in each provider's dashboard:**

| Secret | Where to rotate |
|--------|-----------------|
| `MONGODB_URI` (user `lyzrdbadmin` password) | MongoDB Atlas / AWS DocumentDB → Database Access → edit user → rotate password |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Generate new: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. NOTE: rotating these invalidates all existing login sessions (expected). |
| `LYZR_API_KEY` | Lyzr Studio → API keys → revoke `sk-default-…` and issue a new key |
| `Hostaway_Authorization_token` | Hostaway dashboard → revoke & reissue (the leaked token's exp was year 2087) |
| `VERCEL_OIDC_TOKEN` | Auto-rotated by Vercel; no action, but treat the leaked one as dead |

After rotating, set the new values in **Vercel → Project → Settings →
Environment Variables** (and your local `.env.local`). Never commit them.

## Purging secrets from git history (optional, do when ready)

Removing them from the tree does **not** remove them from history. To scrub
history you must rewrite it and force-push — coordinate this yourself since it
rewrites `main` (safe here: single maintainer, no collaborators).

```bash
# 1. Install git-filter-repo (https://github.com/newren/git-filter-repo)
pip install git-filter-repo

# 2. From a fresh clone, drop the offending paths from ALL history:
git filter-repo --invert-paths --path keys.txt

# 3. Re-add the remote (filter-repo drops it) and force-push every branch:
git remote add origin <your-remote-url>
git push origin --force --all
git push origin --force --tags
```

`seed_data.py` is kept (it now reads from env) but its *old* versions in
history still contain the credentials — rotation (above) is what matters.

## Preventing recurrence

- CI runs `npm run scan:secrets` before lint on every push/PR and fails on any
  hardcoded `mongodb://user:pass@…`, `sk-default-…`, or PEM private key.
- `keys.txt`, `*.key`, and `secrets.*` are gitignored.
- All credentials are read from environment variables (`.env.local`, Vercel),
  never from source. See `.env.example` for the full list.

## Known open item

`/api/chat/status` returns `LYZR_API_KEY` to the browser for the agent
WebSocket. This should be replaced with a short-lived scoped token exchange so
the server key is never exposed client-side.
