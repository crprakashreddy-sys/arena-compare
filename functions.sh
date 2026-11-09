#!/bin/sh
# Re-deploys zingd's server functions (after I change them). No keys needed again.
set -e
cd "$(dirname "$0")"
sh update.sh --no-start || true
for f in cartoon rc-webhook cleanup-snaps; do
  if [ "$f" = "rc-webhook" ]; then npx -y supabase@latest --yes functions deploy $f --no-verify-jwt; else npx -y supabase@latest --yes functions deploy $f; fi
done
echo "✅ Server functions updated."
