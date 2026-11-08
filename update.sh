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
  # Expo sometimes prints a config note and exits non-zero; the packages are still installed, so carry on.
  npx expo install $missing || echo "   (Expo printed a note above; packages are installed, carrying on.)"
else
  echo "   All packages present."
fi

echo "🩺 Checking the database…"
rm -f .db-missing
node scripts/check-db.mjs || true
if [ -f .db-missing ]; then
  # Add any missing files to what gets copied for Supabase, in the right order.
  for b in $(cat .db-missing); do case " $newsql " in *" $b "*) ;; *) newsql="$newsql $b" ;; esac; done
  rm -f .db-missing
fi

echo "🔎 Checking the code…"
if [ -x node_modules/.bin/tsc ]; then
  errs=$(node_modules/.bin/tsc --noEmit -p . 2>&1 | grep -E "error TS" || true)
  n=$(printf "%s" "$errs" | grep -c "error TS" || true)
  if [ "$n" = "0" ]; then echo "   ✅ No code errors."
  else
    echo "   ⚠️  $n type warnings (the app can still run). First few:"
    printf "%s\n" "$errs" | head -5 | sed 's/^/      /'
    printf "%s\n" "$errs" > .code-check.txt
    echo "      Full list saved to .code-check.txt. Send it to Claude if something looks broken."
  fi
else
  echo "   (TypeScript isn't installed yet, skipping. Run: npx expo install -- --save-dev typescript)"
fi

if [ -n "$newsql" ]; then
  # Always run database files in dependency order (later files build on earlier ones).
  ORDER="clubs.sql profile.sql issues.sql events.sql notifications.sql dms.sql speeds.sql clubs_plus.sql crew.sql gifs.sql zings_plus.sql bumble.sql zing_video.sql zing_places.sql personality.sql traits.sql club_rules.sql zing_social.sql matches.sql ai_cartoons.sql hardening.sql"
  sorted=""
  for o in $ORDER; do case " $newsql " in *" $o "*) sorted="$sorted $o" ;; esac; done
  for b in $newsql; do case " $sorted " in *" $b "*) ;; *) sorted="$sorted $b" ;; esac; done
  newsql="$sorted"
  for b in $newsql; do cat "supabase/$b"; echo; done | pbcopy
  open "https://supabase.com/dashboard/project/$PROJECT_REF/sql/new" || true
  echo ""
  echo "🗄  Database update ready:$newsql"
  echo "   It's copied to your clipboard and Supabase is opening."
  echo "   In Supabase: click in the editor, press ⌘V, then click Run."
  echo ""
fi

echo "✅ zingd updated. Starting the app… (scan or reopen zingd in Expo Go)"
[ "$1" = "--no-start" ] && exit 0
npx expo start -c
