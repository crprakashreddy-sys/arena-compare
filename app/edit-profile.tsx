import React, { useState } from "react";
import { Alert, ScrollView, Text, TextInput } from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { PLATE_RE, normalisePlate, verifyVehicle } from "../lib/community";
import { useTheme } from "../lib/theme";
import { Button } from "../components/ui";

export default function EditProfile() {
  const t = useTheme();
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [car, setCar] = useState(profile?.car_model ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [plate, setPlate] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!profile) return;
    if (name.trim().length < 2) return Alert.alert("Add your name", "Other drivers see this on your zaps and reviews.");
    const reg = normalisePlate(plate);
    if (reg && !PLATE_RE.test(reg)) return Alert.alert("Check the vehicle number", "Use the format TS09EV1234, or leave it empty.");
    setBusy(true);
    const { error } = await supabase.from("profiles")
      .update({ display_name: name.trim(), car_model: car.trim() || null, city: city.trim() || null })
      .eq("id", profile.id);
    if (error) { setBusy(false); return Alert.alert("Profile didn't save", "Try again in a moment."); }
    if (reg) {
      try {
        const r = await verifyVehicle(reg);
        Alert.alert(r.verified ? "Verified EV" : "Vehicle saved", r.verified
          ? "Your Verified EV badge is on."
          : r.checked ? "That vehicle isn't registered as electric, so no badge. You can still use everything." : "Saved. The RTO check isn't switched on yet, so there's no badge for now.");
      } catch (e: any) {
        Alert.alert("Vehicle number not saved", e.message);
      }
    }
    await refreshProfile();
    setBusy(false);
    router.back();
  };

  const input = { height: 48, borderWidth: 1, borderColor: t.line, borderRadius: 12, paddingHorizontal: 14, color: t.text, fontSize: 16, backgroundColor: t.surface } as const;
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.muted, fontWeight: "600" }}>Name</Text>
      <TextInput value={name} onChangeText={setName} style={input} maxLength={40} />
      <Text style={{ color: t.muted, fontWeight: "600" }}>Your EV</Text>
      <TextInput value={car} onChangeText={setCar} placeholder="Tata Nexon EV" placeholderTextColor={t.faint} style={input} maxLength={40} />
      <Text style={{ color: t.muted, fontWeight: "600" }}>City</Text>
      <TextInput value={city} onChangeText={setCity} placeholder="Hyderabad" placeholderTextColor={t.faint} style={input} maxLength={40} />
      <Text style={{ color: t.muted, fontWeight: "600" }}>Vehicle number for the Verified EV badge (optional, private)</Text>
      <TextInput value={plate} onChangeText={(v) => setPlate(v.toUpperCase())} placeholder="TS09EV1234" placeholderTextColor={t.faint}
        autoCapitalize="characters" autoCorrect={false} style={input} maxLength={13} />
      <Button title="Save" kind="primary" busy={busy} onPress={save} style={{ marginTop: 10 }} />
    </ScrollView>
  );
}
