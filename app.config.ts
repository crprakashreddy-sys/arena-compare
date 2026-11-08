import type { ExpoConfig } from "expo/config";

// Change these two before publishing: they must be unique to you.
const IOS_BUNDLE_ID = "com.prakash.zappd";
const ANDROID_PACKAGE = "com.prakash.zappd";

const config: ExpoConfig = {
  name: "zingd",
  slug: "zappd",
  version: "1.0.0",
  scheme: "zappd",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: { image: "./assets/splash-icon.png", resizeMode: "contain", backgroundColor: "#FCE38A" },
  ios: {
    bundleIdentifier: IOS_BUNDLE_ID,
    supportsTablet: false,
    usesAppleSignIn: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "zingd uses your location to show the EV chargers nearest to you and their distance.",
      NSCameraUsageDescription:
        "zingd uses the camera so you can post a photo or short video of a charger's status for other drivers.",
      NSMicrophoneUsageDescription:
        "zingd records sound with your video zings. You can add music instead.",
      NSPhotoLibraryUsageDescription:
        "zingd lets you choose a photo or video of a charger to share, or a picture for your profile or club.",
      ITSAppUsesNonExemptEncryption: false,
      LSApplicationQueriesSchemes: ["comgooglemaps"],
    },
  },
  android: {
    package: ANDROID_PACKAGE,
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#FCE38A" },
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "CAMERA"],
    config: {
      googleMaps: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? "" },
    },
  },
  plugins: [
    "expo-router",
    ["expo-notifications", { color: "#FCE38A" }],
    // Zing music and video zings.
    "expo-audio",
    "expo-video",
    // Google Maps inside the iPhone app. Needs EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY; without it iPhone uses Apple Maps.
    ...(process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY
      ? [["react-native-maps", { iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY }] as [string, any]]
      : []),
    [
      "expo-splash-screen",
      { image: "./assets/splash-icon.png", imageWidth: 180, resizeMode: "contain", backgroundColor: "#FCE38A" },
    ],
    "expo-apple-authentication",
    [
      "@react-native-google-signin/google-signin",
      // The reversed iOS client ID from Google Cloud, e.g. com.googleusercontent.apps.1234-abcd
      { iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || "com.googleusercontent.apps.placeholder" },
    ],
    [
      "expo-location",
      { locationWhenInUsePermission: "zingd uses your location to show the EV chargers nearest to you." },
    ],
    [
      "expo-image-picker",
      {
        cameraPermission: "zingd uses the camera so you can post a photo of a charger's status.",
        photosPermission: "zingd lets you choose a photo of a charger to share.",
      },
    ],
  ],
  experiments: { typedRoutes: false },
  owner: "zappd",
  extra: { eas: { projectId: "7e92c868-f3a8-479f-9d57-e6f44a3a02c1" } },
};

export default config;
