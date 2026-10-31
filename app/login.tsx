import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
// Google sign-in needs a native build; in Expo Go it isn't available, so load it only if present.
let GoogleSignin: any = null;
try { GoogleSignin = require("@react-native-google-signin/google-signin").GoogleSignin; } catch { GoogleSignin = null; }
import { supabase, isConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { PLATE_RE, normalisePlate, verifyVehicle } from "../lib/community";
import { useTheme } from "../lib/theme";
import { Button } from "../components/ui";

try {
  GoogleSignin?.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
} catch { GoogleSignin = null; }

const GUIDELINES_URL = "https://YOUR-SITE/zappd/community-guidelines";

export default function Login() {
  const t = useTheme();
  const { session, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<"choose" | "email" | "code" | "profile">("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [appleOK, setAppleOK] = useState(false);

  const [name, setName] = useState("");
  const [car, setCar] = useState("");
  const [city, setCity] = useState("Hyderabad");
  const [plate, setPlate] = useState("");
  const [agree, setAgree] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") AppleAuthentication.isAvailableAsync().then(setAppleOK);
  }, []);

  // Once signed in: new people fill in their profile; returning people are done.
  useEffect(() => {
    if (session && profile) router.back();
    else if (session && !profile) setStep("profile");
  }, [session, profile]);

  const fail = (title: string, e: any) => Alert.alert(title, e?.message ?? "Try again in a moment.");

  const google = async () => {
    setBusy(true);
    try {
      await GoogleSignin.hasPlayServices();
      const res: any = await GoogleSignin.signIn();
      if (res?.type === "cancelled") return;
      const token = res?.data?.idToken ?? res?.idToken;
      if (!token) throw new Error("Google didn't return a sign-in token.");
      const given = res?.data?.user?.name ?? res?.user?.name;
      if (given) setName(given);
      const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token });
      if (error) throw error;
    } catch (e: any) {
      if (e?.code !== "SIGN_IN_CANCELLED" && e?.code !== "-5") fail("Google sign-in didn't work", e);
    } finally {
      setBusy(false);
    }
  };

  const apple = async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!cred.identityToken) throw new Error("Apple didn't return a sign-in token.");
      const full = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(" ");
      if (full) setName(full);
      const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: cred.identityToken });
      if (error) throw error;
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") fail("Apple sign-in didn't work", e);
    }
  };

  const sendCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return Alert.alert("Check your email", "Enter an address like name@gmail.com.");
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return fail("Code didn't send", error);
    setStep("code");
  };

  const checkCode = async () => {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) fail("That code didn't work", { message: "Check the 6-digit code in your email, or send a new one." });
  };

  const saveProfile = async () => {
    if (name.trim().length < 2) return Alert.alert("Add your name", "Other drivers see this on your posts.");
    const reg = normalisePlate(plate);
    if (reg && !PLATE_RE.test(reg)) return Alert.alert("Check the vehicle number", "Use the format TS09EV1234, or leave it empty.");
    if (!agree) return Alert.alert("Community guidelines", "Agree to the guidelines to join.");
    if (!session) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").insert({
      id: session.user.id,
      display_name: name.trim(),
      car_model: car.trim() || null,
      city: city.trim() || null,
    });
    if (error) { setBusy(false); return fail("Profile didn't save", error); }
    if (reg) {
      try { await verifyVehicle(reg); } catch (e: any) { Alert.alert("Vehicle number not saved", e.message); }
    }
    await refreshProfile();
    setBusy(false);
  };

  if (!isConfigured) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 12, justifyContent: "center" }}>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>You're in demo mode</Text>
        <Text style={{ color: t.muted }}>The map, chargers, trip planner, vehicles, charging log and photo looks all work. Signing in, posting zaps and reviews start working once the backend is connected (Launch Steps, step 3).</Text>
      </View>
    );
  }

  const input = [styles.input, { color: t.text, borderColor: t.line, backgroundColor: t.surface }];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        {step !== "profile" && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="flash" size={34} color={t.accent} />
              <Text style={{ color: t.text, fontSize: 34, fontWeight: "900", letterSpacing: -1 }}>zappd</Text>
            </View>
            <Text style={{ color: t.accent, fontWeight: "700" }}>been there. zappd it.</Text>
            <Text style={{ color: t.text, fontSize: 24, fontWeight: "800" }}>Join India's EV driver community</Text>
            <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
              Drop zaps from chargers, see what is working right now, review stations and connect with other EV drivers.
            </Text>
          </>
        )}

        {step === "choose" && (
          <View style={{ gap: 12, marginTop: 8 }}>
            {appleOK && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={{ height: 48 }}
                onPress={apple}
              />
            )}
            {GoogleSignin && <Button title="Continue with Google" icon="logo-google" kind="primary" busy={busy} onPress={google} />}
            <Button title="Use email instead" icon="mail-outline" onPress={() => setStep("email")} />
          </View>
        )}

        {step === "email" && (
          <View style={{ gap: 12 }}>
            <TextInput value={email} onChangeText={setEmail} placeholder="name@gmail.com" placeholderTextColor={t.faint}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={input} />
            <Button title="Send code" kind="primary" busy={busy} onPress={sendCode} />
            <Pressable onPress={() => setStep("choose")}><Text style={{ color: t.accent, textAlign: "center" }}>Back</Text></Pressable>
          </View>
        )}

        {step === "code" && (
          <View style={{ gap: 12 }}>
            <Text style={{ color: t.muted }}>Enter the 6-digit code sent to {email.trim()}.</Text>
            <TextInput value={code} onChangeText={setCode} placeholder="123456" placeholderTextColor={t.faint}
              keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" style={[input, { letterSpacing: 6, fontSize: 20 }]} />
            <Button title="Continue" kind="primary" busy={busy} onPress={checkCode} />
            <Pressable onPress={sendCode}><Text style={{ color: t.accent, textAlign: "center" }}>Send a new code</Text></Pressable>
          </View>
        )}

        {step === "profile" && (
          <View style={{ gap: 12 }}>
            <Text style={{ color: t.text, fontSize: 22, fontWeight: "800" }}>Set up your driver profile</Text>
            <Label text="Your name" />
            <TextInput value={name} onChangeText={setName} placeholder="Prakash Reddy" placeholderTextColor={t.faint} style={input} maxLength={40} />
            <Label text="Your EV (optional)" />
            <TextInput value={car} onChangeText={setCar} placeholder="Tata Nexon EV" placeholderTextColor={t.faint} style={input} maxLength={40} />
            <Label text="City" />
            <TextInput value={city} onChangeText={setCity} placeholder="Hyderabad" placeholderTextColor={t.faint} style={input} maxLength={40} />
            <Label text="Vehicle number (optional, kept private)" />
            <TextInput value={plate} onChangeText={(v) => setPlate(v.toUpperCase())} placeholder="TS09EV1234" placeholderTextColor={t.faint}
              autoCapitalize="characters" autoCorrect={false} style={input} maxLength={13} />
            <Text style={{ color: t.muted, fontSize: 12.5 }}>Other drivers never see your number. It's used only for the Verified EV badge.</Text>

            <Pressable onPress={() => setAgree((a) => !a)} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 4 }}
              accessibilityRole="checkbox" accessibilityState={{ checked: agree }}>
              <Ionicons name={agree ? "checkbox" : "square-outline"} size={22} color={agree ? t.accent : t.muted} />
              <Text style={{ color: t.text, flex: 1, lineHeight: 20 }}>
                I agree to the{" "}
                <Text style={{ color: t.accent }} onPress={() => Linking.openURL(GUIDELINES_URL)}>community guidelines</Text>
                : no abusive, fake or unsafe posts, and no number plates or faces of other people.
              </Text>
            </Pressable>
            <Button title="Join zappd" kind="primary" busy={busy} onPress={saveProfile} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  function Label({ text }: { text: string }) {
    return <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600", marginBottom: -6 }}>{text}</Text>;
  }
}

const styles = StyleSheet.create({
  input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
});
