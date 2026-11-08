import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { INTERESTS, PROMPTS, type Prompt } from "../lib/interests";
import { LIFESTYLE, MAX_LIFESTYLE, MAX_MUSIC, MUSIC, SCALES } from "../lib/traits";
import { TONES, draftBio, type Tone } from "../lib/bioDraft";
import { tickHaptic } from "../lib/motion";
import { CTA, ON_CTA } from "../lib/theme";
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
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [tone, setTone] = useState<Tone>("witty");
  const draft = (tn: Tone = tone) => { tickHaptic(); setTone(tn); setBio(draftBio({ car, city, personality: profile?.personality, traits, interests, kind: profile?.vehicle_kind }, tn, Date.now(), bio)); };
  const [busy, setBusy] = useState(false);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [prompts, setPrompts] = useState<Prompt[]>(profile?.prompts ?? []);
  const [traits, setTraits] = useState<string[]>(profile?.traits ?? []);
  const pickScale = (key: string, id: string) => {
    tickHaptic();
    const ids = SCALES.find((x) => x.key === key)!.options.map((o) => o.id);
    setTraits((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.filter((x) => !ids.includes(x)), id]));
  };
  const lifestyleCount = traits.filter((x) => LIFESTYLE.some((l) => l.id === x)).length;
  const musicCount = traits.filter((x) => MUSIC.some((m) => m.id === x)).length;
  const toggleMusic = (id: string) => { tickHaptic(); setTraits((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : musicCount >= MAX_MUSIC ? cur : [...cur, id]); };
  const toggleLife = (id: string) => { tickHaptic(); setTraits((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : lifestyleCount >= MAX_LIFESTYLE ? cur : [...cur, id]); };
  const toggle = (id: string) => { tickHaptic(); setInterests((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 6 ? cur : [...cur, id]); };
  const pickPrompt = () => {
    const left = PROMPTS.filter((q) => !prompts.some((p) => p.q === q));
    Alert.alert("Pick a prompt", undefined, [...left.map((q) => ({ text: q, onPress: () => setPrompts((p) => [...p, { q, a: "" }]) })), { text: "Cancel", style: "cancel" as const }]);
  };

  const save = async () => {
    if (!profile) return;
    if (name.trim().length < 2) return Alert.alert("Add your name", "Other drivers see this on your zings and reviews.");
    const reg = normalisePlate(plate);
    if (reg && !PLATE_RE.test(reg)) return Alert.alert("Check the vehicle number", "Use the format TS09EV1234, or leave it empty.");
    setBusy(true);
    const { error } = await supabase.from("profiles")
      .update({ display_name: name.trim(), car_model: car.trim() || null, city: city.trim() || null, bio: bio.trim() || null })
      .eq("id", profile.id);
    if (error) { setBusy(false); return Alert.alert("Profile didn't save", "Try again in a moment."); }
    // Interests and prompts are saved separately, so profile basics still save if that database step isn't run yet.
    await supabase.from("profiles").update({ traits }).eq("id", profile.id);
    await supabase.from("profiles").update({
      interests, prompts: prompts.filter((p) => p.a.trim()).map((p) => ({ q: p.q, a: p.a.trim().slice(0, 90) })),
    }).eq("id", profile.id);
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
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ color: t.muted, fontWeight: "600", flex: 1 }}>Bio ({160 - bio.length} left)</Text>
        <Pressable onPress={() => draft()} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: CTA }}>
          <Text style={{ color: ON_CTA, fontWeight: "800", fontSize: 13 }}>{bio ? "✨ Shuffle" : "✨ Draft for me"}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {TONES.map((tn) => (
          <Pressable key={tn.id} onPress={() => draft(tn.id)} style={{ flexDirection: "row", gap: 4, alignItems: "center", height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: tone === tn.id && bio ? t.text : t.surface }}>
            <Text style={{ fontSize: 12 }}>{tn.emoji}</Text>
            <Text style={{ color: tone === tn.id && bio ? t.bg : t.text, fontWeight: "700", fontSize: 12.5 }}>{tn.label}</Text>
          </Pressable>
        ))}
        <Text style={{ color: t.faint, fontSize: 11.5, alignSelf: "center", flex: 1, textAlign: "right" }}>Edit it however you like</Text>
      </View>
      <TextInput value={bio} onChangeText={setBio} placeholder="Weekend road-tripper. Nexon EV since 2023. Chai at every charger."
        placeholderTextColor={t.faint} multiline maxLength={160} style={[input, { height: 84, paddingTop: 12, textAlignVertical: "top" }]} />
      <Text style={{ color: t.text, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 18, marginTop: 8 }}>Your vibe</Text>
      {SCALES.map((sc) => (
        <View key={sc.key} style={{ gap: 6 }}>
          <Text style={{ color: t.muted, fontWeight: "600", fontSize: 13 }}>{sc.title}</Text>
          <View style={{ flexDirection: "row", gap: 6, padding: 4, borderRadius: 16, backgroundColor: t.surface }}>
            {sc.options.map((o) => {
              const on = traits.includes(o.id);
              return (
                <Pressable key={o.id} onPress={() => pickScale(sc.key, o.id)} style={{ flex: 1, height: 40, borderRadius: 12, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center", backgroundColor: on ? CTA : "transparent" }}>
                  <Text>{o.emoji}</Text><Text style={{ color: on ? ON_CTA : t.text, fontWeight: "800", fontSize: 13 }}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <Text style={{ color: t.muted, fontWeight: "600", fontSize: 13 }}>Off the road you're into ({lifestyleCount}/{MAX_LIFESTYLE})</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {LIFESTYLE.map((l) => {
          const on = traits.includes(l.id);
          return (
            <Pressable key={l.id} onPress={() => toggleLife(l.id)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: on ? CTA : t.surface }}>
              <Text>{l.emoji}</Text><Text style={{ color: on ? ON_CTA : t.text, fontWeight: "700", fontSize: 13.5 }}>{l.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ color: t.muted, fontWeight: "600", fontSize: 13 }}>On your car playlist ({musicCount}/{MAX_MUSIC})</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {MUSIC.map((m) => {
          const on = traits.includes(m.id);
          return (
            <Pressable key={m.id} onPress={() => toggleMusic(m.id)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: on ? CTA : t.surface }}>
              <Text>{m.emoji}</Text><Text style={{ color: on ? ON_CTA : t.text, fontWeight: "700", fontSize: 13.5 }}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ color: t.muted, fontWeight: "600", marginTop: 6 }}>Your EV life ({interests.length}/6)</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {INTERESTS.map((i) => {
          const on = interests.includes(i.id);
          return (
            <Pressable key={i.id} onPress={() => toggle(i.id)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: on ? CTA : t.surface }}>
              <Text>{i.emoji}</Text><Text style={{ color: on ? ON_CTA : t.text, fontWeight: "700", fontSize: 13.5 }}>{i.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ color: t.muted, fontWeight: "600", marginTop: 10 }}>Prompts: show your personality ({prompts.length}/3)</Text>
      {prompts.map((p, k) => (
        <View key={p.q} style={{ backgroundColor: t.surface, borderRadius: 18, padding: 14, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ color: t.muted, fontWeight: "800", fontSize: 13, flex: 1 }}>{p.q}</Text>
            <Pressable onPress={() => setPrompts((all) => all.filter((_, j) => j !== k))} hitSlop={8}><Text style={{ color: t.muted, fontWeight: "700" }}>Remove</Text></Pressable>
          </View>
          <TextInput value={p.a} onChangeText={(v) => setPrompts((all) => all.map((x, j) => (j === k ? { ...x, a: v } : x)))}
            placeholder="Your answer" placeholderTextColor={t.faint} maxLength={90}
            style={{ color: t.text, fontSize: 18, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }} />
        </View>
      ))}
      {prompts.length < 3 && (
        <Pressable onPress={pickPrompt} style={{ height: 48, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: t.line, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: t.text, fontWeight: "800" }}>+ Add a prompt</Text>
        </Pressable>
      )}

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
