import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { useTheme } from "../lib/theme";
import { kmPerKWh, useGarage, vehicleName } from "../lib/vehicles";
import { monthTotals, rupees, useSessions } from "../lib/sessions";

// Starting values only; every one is editable. Fuel prices change, so the screen asks drivers to check.
const DEFAULTS = {
  km: 1200, petrol: 107, diesel: 95, petrolKmpl: 15, dieselKmpl: 18,
  homeRate: 8, publicRate: 20, publicShare: 30,
};

/** EV versus petrol or diesel: monthly and yearly running cost. */
export default function Savings() {
  const t = useTheme();
  const { active: v } = useGarage();
  const { sessions } = useSessions();
  const month = monthTotals(sessions);

  const [fuel, setFuel] = useState<"petrol" | "diesel">("petrol");
  const [km, setKm] = useState(String(DEFAULTS.km));
  const [price, setPrice] = useState(String(DEFAULTS.petrol));
  const [kmpl, setKmpl] = useState(String(DEFAULTS.petrolKmpl));
  const [homeRate, setHomeRate] = useState(String(DEFAULTS.homeRate));
  const [publicRate, setPublicRate] = useState(String(DEFAULTS.publicRate));
  const [share, setShare] = useState(String(DEFAULTS.publicShare));

  const n = (s: string, d: number) => { const x = parseFloat(s); return isFinite(x) && x >= 0 ? x : d; };
  const kmMonth = n(km, DEFAULTS.km);
  const efficiency = v ? kmPerKWh(v) : 7; // km per kWh
  const kWhMonth = kmMonth / efficiency;
  const pub = Math.min(100, n(share, 30)) / 100;
  const evCost = kWhMonth * ((1 - pub) * n(homeRate, 8) + pub * n(publicRate, 20));
  const fuelCost = (kmMonth / Math.max(1, n(kmpl, 15))) * n(price, 107);
  const save = fuelCost - evCost;

  const switchFuel = (f: "petrol" | "diesel") => {
    setFuel(f);
    setPrice(String(f === "petrol" ? DEFAULTS.petrol : DEFAULTS.diesel));
    setKmpl(String(f === "petrol" ? DEFAULTS.petrolKmpl : DEFAULTS.dieselKmpl));
  };

  const max = Math.max(evCost, fuelCost, 1);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Savings" }} />

      <View style={[styles.hero, { backgroundColor: "#14202B" }]}>
        <Text style={{ color: "#A3ADB6", fontSize: 13, fontWeight: "600" }}>YOU SAVE ABOUT</Text>
        <Text style={{ color: save >= 0 ? "#6DD39A" : "#F28B82", fontSize: 44, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
          {rupees(Math.abs(save))}<Text style={{ fontSize: 18, color: "#A3ADB6" }}> / month</Text>
        </Text>
        <Text style={{ color: "#D8DDE2" }}>
          {rupees(Math.abs(save) * 12)} a year versus a {fuel} car{save < 0 ? " (the EV costs more with these numbers)" : ""}.
        </Text>
        <View style={{ gap: 8, marginTop: 8 }}>
          {[
            [v ? vehicleName(v) : "Your EV", evCost, "#FFD60A", `₹${(evCost / kmMonth).toFixed(1)}/km`],
            [fuel === "petrol" ? "Petrol car" : "Diesel car", fuelCost, "#8E99A4", `₹${(fuelCost / kmMonth).toFixed(1)}/km`],
          ].map(([label, val, col, perKm]) => (
            <View key={label as string} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>{label as string}</Text>
                <Text style={{ color: "#fff", fontVariant: ["tabular-nums"] }}>{rupees(val as number)} · {perKm as string}</Text>
              </View>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: "#24313D" }}>
                <View style={{ width: `${((val as number) / max) * 100}%`, height: 10, borderRadius: 5, backgroundColor: col as string }} />
              </View>
            </View>
          ))}
        </View>
      </View>

      {month.count > 0 && (
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <Text style={{ color: t.text, fontWeight: "700" }}>From your charging log this month</Text>
          <Text style={{ color: t.muted }}>
            {month.count} charges, {Math.round(month.kWh)} kWh, {rupees(month.cost)} paid
            {month.perKWh ? ` (₹${month.perKWh.toFixed(1)} per kWh on average)` : ""}.
          </Text>
        </View>
      )}

      <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600" }}>Your driving</Text>
      <Field label="Kilometres a month" value={km} onChange={setKm} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["petrol", "diesel"] as const).map((f) => (
          <Pressable key={f} onPress={() => switchFuel(f)} accessibilityRole="button" accessibilityState={{ selected: fuel === f }}
            style={[styles.seg, { borderColor: fuel === f ? t.accent : t.line, backgroundColor: fuel === f ? t.accentSoft : t.bg }]}>
            <Text style={{ color: fuel === f ? t.accent : t.text, fontWeight: "700" }}>Compare with {f}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Field label={`${fuel === "petrol" ? "Petrol" : "Diesel"} price (₹/litre)`} value={price} onChange={setPrice} />
        <Field label="That car's mileage (km/litre)" value={kmpl} onChange={setKmpl} />
      </View>
      <Text style={{ color: t.muted, fontSize: 12.5 }}>Check today's fuel price in your city; it changes often.</Text>

      <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600", marginTop: 6 }}>Your charging</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Field label="Home rate (₹/kWh)" value={homeRate} onChange={setHomeRate} />
        <Field label="Public rate (₹/kWh)" value={publicRate} onChange={setPublicRate} />
      </View>
      <Field label="Share of charging done in public (%)" value={share} onChange={setShare} />
      <Text style={{ color: t.muted, fontSize: 12.5, lineHeight: 18 }}>
        {v ? `Using about ${efficiency.toFixed(1)} km per kWh for your ${vehicleName(v)}, from its range and battery.` : "Using about 7 km per kWh. Add your EV for a closer figure."}
        {" "}Home rate is your electricity tariff; public DC fast charging is usually higher.
      </Text>
    </ScrollView>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ color: t.muted, fontSize: 12.5 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad"
        style={{ height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, color: t.text, borderColor: t.line, backgroundColor: t.surface }} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 18, padding: 16, gap: 4 },
  card: { borderRadius: 12, padding: 14, gap: 4 },
  seg: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
