#!/bin/sh
# Builds zingd onto your iPhone (cable connected) so native features work:
# AI cartoons, and everything Expo Go can't run. Needs Xcode installed and signed in once.
set -e
cd "$(dirname "$0")"
command -v xcodebuild >/dev/null || { echo "❌ Xcode isn't installed. Get it from the Mac App Store, open it once, then run this again."; exit 1; }
sh update.sh --no-start || true
echo "🔧 Preparing the iOS project…"
npx expo prebuild --platform ios --clean
echo "📱 Building onto your iPhone (first time takes 5–10 minutes)…"
npx expo run:ios --device --configuration Debug
