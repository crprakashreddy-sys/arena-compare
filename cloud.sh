#!/bin/sh
# Builds zingd in Expo's cloud and installs it on your iPhone. No Xcode needed.
# Needs: your Apple Developer account (approved) and the Expo account "zappd".
set -e
cd "$(dirname "$0")"
sh update.sh --no-start || true
echo "🔑 Step 1: sign in to Expo (account: zappd)"
npx -y eas-cli@latest whoami >/dev/null 2>&1 || npx -y eas-cli@latest login
echo ""
echo "📱 Step 2: register your iPhone (only the first time)."
echo "   A QR code / link appears: open it ON YOUR IPHONE, install the profile it offers"
echo "   (Settings → General → VPN & Device Management → Install), then come back here."
if [ ! -f .device-registered ]; then
  npx -y eas-cli@latest device:create && touch .device-registered
fi
echo ""
echo "☁️  Step 3: building in the cloud (15–25 minutes). Sign in with your Apple ID when asked; say Yes to the defaults."
npx -y eas-cli@latest build --platform ios --profile preview
echo ""
echo "✅ When it finishes, open the link or scan the QR code above with your iPhone camera to install zingd."
