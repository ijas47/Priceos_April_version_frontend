#!/usr/bin/env bash
#
# Fail the build if any git-tracked file contains a hardcoded credential.
# Self-contained (no external dependencies) so it runs anywhere CI runs.
#
set -euo pipefail

# Connection strings with inline user:pass@, Lyzr-style keys, private keys.
PATTERNS='mongodb(\+srv)?://[^ "'"'"']*:[^ "'"'"'@]*@|sk-default-[A-Za-z0-9]{8}|-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----'

# Files allowed to mention the patterns (placeholders / this scanner / docs).
EXCLUDE='^(\.env\.example|SECURITY\.md|scripts/check-secrets\.sh)$'

hits=0
while IFS= read -r f; do
  echo "$f" | grep -qE "$EXCLUDE" && continue
  [ -f "$f" ] || continue
  if grep -EInq "$PATTERNS" "$f" 2>/dev/null; then
    echo "❌ potential hardcoded secret in: $f"
    hits=1
  fi
done < <(git ls-files)

if [ "$hits" -ne 0 ]; then
  echo ""
  echo "Secret scan FAILED. Move credentials to environment variables (.env.local)."
  echo "See SECURITY.md for the rotation + history-purge runbook."
  exit 1
fi

echo "✅ secret scan clean"
