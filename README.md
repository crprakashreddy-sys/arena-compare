# zappd

India's EV driver community app for iPhone and Android: a satellite charger map, live **zaps** (24-hour photo stories from chargers), reviews, facilities, food nearby and driver connections.

Built with React Native (Expo) and Supabase. Everything runs on free tiers. The only fees are the app stores' own: Apple US$99 a year and Google Play US$25 once.

---

## What's in the app

| Area | What it does |
|---|---|
| **Map** | Satellite map with labels (Apple Maps on iPhone, Google Maps on Android) and your live GPS dot. Charger pins have a coloured ring for live status: green working, amber busy, red not working. Search any place in India, then filter by Zaps, DC fast, Working now or network. Long-press to drop a pin anywhere. |
| **Zap bubbles** | Chargers with zaps from the last 24 hours show a yellow photo bubble above the pin. Tap it to watch the zaps as a story. |
| **Preview card** | Tap a pin and a card slides up with status and "Zaps from the last visits". From there, watch the zaps or open the full charger page. |
| **Drop a zap** | The yellow camera button opens the zap camera at the nearest charger, or one you choose. Pick Working, Busy or Not working and take or choose a photo. Add a tip, then drop it. |
| **Cinematic editor** | **Looks:** Cinema (teal and orange with letterbox), Neon Night (glow), Golden Hour (light leak), Monsoon, Film 35 (grain), Noir, Dreamy, Vivid and Original. Swipe the photo to change look. **Cinema tools:** film grain, vignette, letterbox, glow and light leak. **EV stickers** you drag anywhere: status, battery %, speed, charger name, time, wait time and your car. **Privacy blur:** tap to blur number plates and faces. |
| **Charger page** | Mini satellite view, live status, zaps strip and directions. **Facilities** are marked by drivers (washroom, cafe, parking, 24×7, covered, security, wheelchair access, waiting area, Wi-Fi) and show once more drivers agree than disagree. **Reviews** have stars, tags, helpful votes and a Report button. **Eat while you charge** lists cafes and restaurants within walking distance, plus drivers' own food tips. |
| **Zaps feed** | A dark, full-screen feed of zaps within 25 km from the last 24 hours. |
| **Drivers** | Profiles with points, badge (New zapper, Regular, Top zapper, Charging legend) and connection count. **Connect** sends a request, which the other driver can accept or decline. You can report or block any driver. |
| **You** | Your stats, connection requests and EV crew. Also: edit profile, optional Verified EV badge, community guidelines, privacy policy, sign out, and delete account. |
| **Zap Score** | Every zap earns points, more the closer you are to the charger (up to 145 at the plug). Weekly leaderboard per city. Scores are worked out by the database, never the phone. |
| **My vehicles** | Pick your EV from 24 popular cars and two-wheelers, or correct its battery and range. The map shows only chargers that fit it, and every charger shows your charging speed and 20→80% time. Saved on the phone only. |
| **Trip planner** | Pick a destination and battery level; the app finds a road route (OSRM), chargers along it that fit your vehicle, and plans stops that never drop below 15%. Opens the route with stops in Google Maps. |
| **Charging log** | Start a timer at any charger, then save kWh and rupees when you finish. Monthly spend and average price per kWh. Saved on the phone only. |
| **Savings** | EV versus petrol or diesel per month and year, with your kilometres, fuel price, tariff and the charging log. |
| **Problem reports** | When a charger is busy or broken, drivers can tag what's wrong (won't start, payment failed, petrol car in the spot…). Charger pages show problems from the last 48 hours. |
| **Pay in network app** | Opens that network's app to start and pay. Taking payment for every network inside this app needs a deal with each company. |
| **Sign-in** | Continue with Apple, Continue with Google, or an email code. All free. The map works without an account. |
| **Safety** | Report and block on every zap, review, food tip and profile. Content reported by 3 people is hidden automatically. Zap photos are deleted after 24 hours. |

---

## See it live on your phone first (about 20 minutes, no accounts)

The app has a **demo mode**: with no `.env` file it shows the 85 bundled Hyderabad chargers with sample status, so you can try the real app before setting anything up.

1. On your phone, install **Expo Go** from the App Store or Play Store.
2. On your laptop, install **Node.js** (LTS) from nodejs.org.
3. Unzip this folder, open a terminal inside it and run:

   ```
   npm install
   npx expo install --fix
   npx expo start
   ```

4. Keep the phone on the same Wi-Fi as the laptop. Scan the QR code in the terminal: on iPhone with the Camera app, on Android from inside Expo Go.
5. If the phone can't connect, stop it with Ctrl+C and run `npx expo start --tunnel` instead.

In demo mode the map, chargers, vehicles, trip planner, charging log, savings and photo looks work. Signing in and posting need the backend (below). Google sign-in only appears in a real build, not in Expo Go.

---

## Setup (about 1 hour, all free)

### 1. Install the tools on your computer

- **Node.js 20 or newer:** download from nodejs.org.
- In a terminal, inside this folder, run:

  ```
  npm install
  npx expo install --fix
  ```

  The second command picks the exact library versions that match the Expo version you have.

### 2. Create the backend (Supabase, free)

1. Sign up at supabase.com and create a project. Pick the **Mumbai** region for speed in India.
2. Open **SQL Editor**, paste the whole of `supabase/schema.sql` and click **Run**. Then do the same with `supabase/seed_hyderabad.sql`, which adds 85 verified Hyderabad chargers so the map has content from day one.
   Already ran an older `schema.sql`? Run only the part from `-- Zap Score` to the end; it adds scoring without touching your data.
3. Open **Project Settings › API**. Copy the **Project URL** and the **anon public key**.
4. Copy `.env.example` to a new file called `.env`, then paste those two values in.

### 3. Charger data for all of India (free)

Sign up at openchargemap.org, then go to **My Profile › My Apps** and register an app. Paste the key into `.env` as `EXPO_PUBLIC_OCM_KEY`.

### 4. Maps on Android (free)

Android draws Google Maps; iPhone uses Apple Maps and needs no key.

1. In Google Cloud Console, create a project and enable **Maps SDK for Android**.
2. Create an API key, restrict it to your Android app, and put it in `.env` as `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`.

Mobile map display is free with no usage limit.

### 5. Sign-in (free)

- **Google:**
  1. In Google Cloud, go to **APIs & Services › Credentials** and create OAuth client IDs: one **Web**, one **iOS** (with your bundle ID) and one **Android** (with your package name and the SHA-1 from `eas credentials`).
  2. Put the Web and iOS client IDs in `.env`, along with the reversed iOS ID as `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`.
  3. In Supabase, go to **Authentication › Providers › Google**, enable it and paste the Web client ID and secret.
- **Apple:** in Supabase, go to **Authentication › Providers › Apple** and enable it. Add your bundle ID as the client ID. Apple requires this button on iPhone whenever Google sign-in is offered.
- **Email code:** in Supabase, go to **Authentication › Email Templates › Magic Link** and make sure the template shows `{{ .Token }}`, so people get a 6-digit code.
  - Supabase's built-in email sender only allows a few emails an hour.
  - For launch, connect a free SMTP sender (Brevo: 300 emails a day free) under **Authentication › SMTP Settings**.

### 6. Make zaps disappear after 24 hours

1. Install the Supabase command line tool from supabase.com/docs/guides/cli.
2. Run:

   ```
   supabase functions deploy cleanup-snaps
   supabase functions deploy verify-vehicle
   ```

3. In the dashboard, go to **Integrations › Cron**, create a job that runs **every hour** and calls the `cleanup-snaps` function.

### 7. Run it on your phone

```
npx expo start
```

This app uses native camera, maps and graphics, so it needs a **development build** rather than the Expo Go app.

```
npm install -g eas-cli
eas login
eas build --profile development --platform android   # or ios
```

Install the build from the link EAS gives you, then run `npx expo start` and scan the QR code.

---

## No Mac needed

EAS Build compiles the iPhone app on Expo's cloud Macs. The free plan includes a monthly build allowance.

```
eas build --platform ios --profile production
eas submit --platform ios
```

`eas submit` uploads straight to App Store Connect.

## Publish

### Google Play (US$25 once)

1. Create a developer account at play.google.com/console.
2. Run `eas build --platform android --profile production`, then `eas submit --platform android`.
3. Fill in the store listing, the **Data safety** form (same answers as Apple's below) and content rating, then send it for review. Start with **Internal testing** for your team.

### Apple App Store (US$99 a year)

1. Join the Apple Developer Program.
2. In App Store Connect, create the app with the same bundle ID as in `app.config.ts`.
3. Run `eas build --platform ios --profile production`, then `eas submit --platform ios`, and test through TestFlight.
4. Fill in the listing and the **App Privacy** answers:
   - Precise location, used for app functionality.
   - Photos, user content.
   - Name and email, used for the account.
   - Nothing used for tracking.
5. In **Review Notes**, give Apple a demo login and explain zaps.

### Before you submit

- [ ] Change `IOS_BUNDLE_ID` and `ANDROID_PACKAGE` in `app.config.ts` to your own, for example `com.yourname.zappd`.
- [ ] Host `PRIVACY.md` and `COMMUNITY_GUIDELINES.md` as web pages (Google Sites, Notion or GitHub Pages are free). Replace the `YOUR-SITE` links in `app/(tabs)/profile.tsx` and `app/login.tsx`.
- [ ] Put a real contact email in both documents.
- [ ] Check that report, block and delete account work. Apple tests these for community apps.
- [ ] Take store screenshots on a 6.7" phone.

---

## Optional: Verified EV badge

The `verify-vehicle` function can check a vehicle number against the RTO record through a paid service (Surepass, IDfy or Signzy, roughly ₹1–5 per check). Set `RC_API_URL` and `RC_API_KEY` as function secrets to switch it on. Without them, vehicle numbers are saved privately and nobody gets a badge. Everyone can use the app either way.

## Free tier limits

| Service | Free allowance | When you'd outgrow it |
|---|---|---|
| Supabase | 500 MB database, 1 GB photo storage, 5 GB transfer a month, 50,000 monthly users | Around 3,000–5,000 daily zap viewers. The Pro plan is US$25 a month. |
| Open Charge Map, OpenStreetMap (food), Photon (search) | Free, fair use | Very high traffic. Move to paid map APIs then. |
| OSRM demo server (trip routes) | Free, light use only | Before launch, switch `getRoute` in `lib/trip.ts` to your own OSRM server or a paid routing API; the public demo server isn't meant for production apps. |
| Google Maps Android SDK, Apple Maps | Free for map display | Never, for display |
| EAS Build | Monthly free builds | Frequent releases. The paid plan is US$19 a month. |

Photos are compressed and deleted after 24 hours, which keeps storage well inside the free tier.

## Project layout

```
app/
  (tabs)/index.tsx      Map, search, filters, zap bubbles, preview card
  (tabs)/feed.tsx       Zaps near you
  (tabs)/drop.tsx       Centre camera button
  (tabs)/profile.tsx    You: stats, requests, crew, settings, delete account
  charger/[id].tsx      Charger page
  zap/[id].tsx          Drop a zap (camera + cinematic editor)
  review/[id].tsx       Write a review
  facilities/[id].tsx   Mark facilities
  driver/[id].tsx       Another driver's profile and Connect
  login.tsx             Apple, Google or email sign-in, then profile setup
  edit-profile.tsx      Edit name, EV, city, vehicle number
components/
  PhotoEditor.tsx       Skia editor: looks, cinema tools, stickers, blur
  SnapViewer.tsx        Full-screen zap story viewer
  SafetyMenu.ts         Report and block
  ui.tsx                Buttons, chips, stars, pins, status banner
lib/
  chargers.ts           Open Charge Map + community chargers, merged
  community.ts          Zaps, reviews, facilities, food tips, connections, safety
  filters.ts            Cinematic looks
  places.ts             Nearby food and place search
  auth.tsx, supabase.ts, networks.ts, geo.ts, theme.ts, types.ts
supabase/
  schema.sql            Tables, row security, storage, account deletion
  seed_hyderabad.sql    85 Hyderabad chargers
  functions/            cleanup-snaps (24 h), verify-vehicle (optional)
```

This code was written and checked without running it on a phone. Expect a small fix or two on the first build. Paste any red error message back to Claude.
