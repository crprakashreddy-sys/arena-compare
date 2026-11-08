import React, { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { endDrive, startDrive, useDriveTracker } from "../lib/drive";
import { useGarage, vehicleName } from "../lib/vehicles";
import { Ionicons } from "../components/SFIcon";
import { IconTile } from "../components/Icon";
import { successHaptic, tapHaptic } from "../lib/motion";
import { timeAgo } from "../lib/geo";

const START = "zappd://drive?state=start";
const END = "zappd://drive?state=end";

/**
 * One-time setup: two iPhone Shortcuts automations tell zingd when you get in and out of your EV
 * (your phone connecting to the car's Bluetooth or CarPlay). After that it's fully automatic.
 */
export default function AutoDetect() {
  const t = useTheme();
  const d = useDriveTracker();
  const { active: v } = useGarage();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (url: string) => { await Clipboard.setStringAsync(url); tapHaptic(); setCopied(url); setTimeout(() => setCopied(null), 1800); };

  const Step = ({ n, title, body, children }: { n: number; title: string; body: string; children?: React.ReactNode }) => (
    <View style={[s.step, { backgroundColor: t.surface }]}>
      <View style={s.num}><Text style={s.numText}>{n}</Text></View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 16 }}>{title}</Text>
        <Text style={{ color: t.muted, lineHeight: 20 }}>{body}</Text>
        {children}
      </View>
    </View>
  );
  const Link = ({ url, label }: { url: string; label: string }) => (
    <Pressable onPress={() => copy(url)} style={[s.link, { backgroundColor: t.bg, borderColor: copied === url ? "#2FBF71" : t.line }]}>
      <Text style={{ color: t.text, fontFamily: "Menlo", fontSize: 12.5, flex: 1 }} numberOfLines={1}>{url}</Text>
      <Text style={{ color: copied === url ? "#2FBF71" : t.text, fontWeight: "800" }}>{copied === url ? "Copied ✓" : `Copy ${label}`}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 48 }}>
      <Stack.Screen options={{ title: "Auto-detect my car" }} />
      <View style={[s.hero, { backgroundColor: d.setupDone ? "#1A1A1A" : "#FCE38A" }]}>
        <IconTile name="car" size={54} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: d.setupDone ? "#FCE38A" : "#1A1A1A", fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 19 }}>
            {d.driving ? "Driving now 🚗" : d.setupDone ? "Auto-detect is on ✓" : "Let zingd know when you're in your EV"}
          </Text>
          <Text style={{ color: d.setupDone ? "#C9CED3" : "#3C3410", lineHeight: 19 }}>
            {d.driving ? `Started ${timeAgo(d.startedAt!)} · ${d.km.toFixed(1)} km so far`
              : d.setupDone ? (d.lastKm != null ? `Last drive: ${d.lastKm} km, ${timeAgo(d.endedAt!)}` : "Waiting for your first drive.")
              : "One-time, 2-minute setup. Then charger prompts only show when you're in your car, and your battery estimate updates itself after every drive."}
          </Text>
        </View>
      </View>

      <Text style={[s.h, { color: t.text }]}>Set it up once</Text>
      <Step n={1} title="Open Shortcuts → Automation" body="Tap + (New Automation), choose Bluetooth (or CarPlay).">
        <Pressable onPress={() => Linking.openURL("shortcuts://").catch(() => Alert.alert("Shortcuts not found", "Install Apple's Shortcuts app from the App Store."))} style={[s.btn, { backgroundColor: CTA }]}>
          <Ionicons name="open-outline" size={16} color={ON_CTA} /><Text style={{ color: ON_CTA, fontWeight: "800" }}>Open Shortcuts</Text>
        </Pressable>
      </Step>
      <Step n={2} title={`Pick your car${v ? ` (${vehicleName(v)})` : ""}`} body="Choose your car's Bluetooth name, tick “Is Connected”, and set it to Run Immediately.">
      </Step>
      <Step n={3} title="Add “Open URLs” and paste this" body="Tap New Blank Automation → Add Action → search “Open URLs” → paste:">
        <Link url={START} label="start" />
      </Step>
      <Step n={4} title="Repeat for when you get out" body="Make a second automation: same Bluetooth device, tick “Is Disconnected”, Run Immediately, Open URLs:">
        <Link url={END} label="end" />
      </Step>

      <Text style={[s.h, { color: t.text, marginTop: 6 }]}>Try it</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable onPress={async () => { await startDrive(); successHaptic(); }} style={[s.btn, { flex: 1, backgroundColor: t.surface }]}>
          <Text style={{ color: t.text, fontWeight: "800" }}>🚗  Pretend I got in</Text>
        </Pressable>
        <Pressable onPress={async () => { const r = await endDrive(); successHaptic(); Alert.alert("Drive saved", `${r.km} km${r.used ? `, about ${r.used}% battery used` : ""}.`); }}
          disabled={!d.driving} style={[s.btn, { flex: 1, backgroundColor: t.surface, opacity: d.driving ? 1 : 0.4 }]}>
          <Text style={{ color: t.text, fontWeight: "800" }}>🅿️  Pretend I got out</Text>
        </Pressable>
      </View>

      <Text style={[s.h, { color: t.text, marginTop: 6 }]}>What it does</Text>
      {[
        ["⚡", "“Charging here?” only pops up when you've just driven to a charger, never when you're in a cab."],
        ["🔋", "Your battery estimate updates after every drive (distance × your car's real-world use), and resets from each tracked charge."],
        ["🔒", "Only drive start and end times and distance are kept, on your phone. Your route isn't saved or shared."],
      ].map(([e, txt]) => (
        <View key={e} style={{ flexDirection: "row", gap: 12 }}>
          <Text style={{ fontSize: 20 }}>{e}</Text><Text style={{ color: t.muted, flex: 1, lineHeight: 20 }}>{txt}</Text>
        </View>
      ))}
      <Text style={{ color: t.faint, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
        In the App Store version this also works by itself from your car's Bluetooth. The Shortcuts setup makes it instant and reliable.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 24 },
  h: { fontSize: 19, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold" },
  step: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 20 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#1A1A1A", alignItems: "center", justifyContent: "center" },
  numText: { color: "#FCE38A", fontWeight: "900" },
  link: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, marginTop: 6 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 22, paddingHorizontal: 16, alignSelf: "flex-start", marginTop: 6 },
});
