#!/bin/sh
# Switches on premium AI cartoons: saves your Gemini key on Supabase (never in the app) and deploys the server code.
# You need: a Gemini API key from https://aistudio.google.com/apikey with billing turned on in Google Cloud.
set -e
cd "$(dirname "$0")"
sh update.sh --no-start || true
REF=$(grep EXPO_PUBLIC_SUPABASE_URL .env | sed -E 's#.*https://([^.]+)\.supabase\.co.*#\1#')
[ -n "$REF" ] || { echo "❌ Couldn't find your Supabase project in .env"; exit 1; }
echo "🔑 Sign in to Supabase (a browser opens once)…"
npx -y supabase@latest login
npx -y supabase@latest link --project-ref "$REF"
printf "Paste your Gemini API key and press Enter: "
read GEMINI
[ -n "$GEMINI" ] || { echo "❌ No key entered"; exit 1; }
SECRET=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)
npx -y supabase@latest secrets set GEMINI_API_KEY="$GEMINI" RC_WEBHOOK_SECRET="$SECRET"
npx -y supabase@latest functions deploy cartoon
npx -y supabase@latest functions deploy rc-webhook --no-verify-jwt
echo ""
echo "✅ AI cartoons are on. Everyone gets 1 free."
echo "📝 Later, for paid packs, use this in RevenueCat → Integrations → Webhooks:"
echo "   URL:           https://$REF.supabase.co/functions/v1/rc-webhook"
echo "   Authorization: $SECRET"
echo "$SECRET" > .rc-webhook-secret
