#!/bin/sh
# zingd one-step update: new code, new packages, database changes, then starts the app.
# Run it from your zingd folder:  sh update.sh
set -e
[ -f app.config.ts ] || { echo "Run this inside your zingd folder."; exit 1; }
PROJECT_REF="dqsrxwwwvoaargzvdmpp"

echo "⬇️  Getting the latest zingd…"
tmp=$(mktemp -d)
curl -fsSL https://codeload.github.com/crprakashreddy-sys/arena-compare/tar.gz/refs/heads/zappd | tar -xz -C "$tmp"
src="$tmp/arena-compare-zappd"

# Database files that are new or changed (the main schema and seed files are run once by hand).
newsql=""
for f in "$src"/supabase/*.sql; do
  b=$(basename "$f")
  case "$b" in schema.sql|seed*) continue ;; esac
  if [ ! -f "supabase/$b" ] || ! cmp -s "$f" "supabase/$b"; then newsql="$newsql $b"; fi
done

rsync -a --exclude .env --exclude node_modules --exclude .npmrc --exclude .expo \
  --exclude package.json --exclude package-lock.json "$src/" ./
rm -rf "$tmp"

echo "📦 Checking packages…"
missing=""
for p in $(cat deps.txt); do [ -d "node_modules/$p" ] || missing="$missing $p"; done
if [ -n "$missing" ]; then
  echo "   Installing:$missing"
  npx expo install $missing
else
  echo "   All packages present."
fi

if [ -n "$newsql" ]; then
  for b in $newsql; do cat "supabase/$b"; echo; done | pbcopy
  open "https://supabase.com/dashboard/project/$PROJECT_REF/sql/new" || true
  echo ""
  echo "🗄  Database update ready:$newsql"
  echo "   It's copied to your clipboard and Supabase is opening."
  echo "   In Supabase: click in the editor, press ⌘V, then click Run."
  echo ""
fi

echo "✅ zingd updated. Starting the app… (scan or reopen zingd in Expo Go)"
npx expo start -c
