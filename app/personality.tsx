import React, { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { PERSONALITIES, QUIZ, personalityById, scoreQuiz, type PersonalityId } from "../lib/personality";
import { successHaptic, tapHaptic } from "../lib/motion";

/** "What kind of EV driver are you?" Six quick questions, one fun result. */
export default function PersonalityQuiz() {
  const { profile, refreshProfile } = useAuth();
  const [step, setStep] = useState(profile?.personality ? -1 : 0); // -1 = show current result
  const [picks, setPicks] = useState<number[]>([]);
  const [result, setResult] = useState<PersonalityId | null>((profile?.personality as PersonalityId) ?? null);
  const [saving, setSaving] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;
  const showing = step === -1 || step >= QUIZ.length;

  useEffect(() => {
    if (showing) { pop.setValue(0); Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 14 }).start(); }
  }, [showing, result]);

  const answer = (i: number) => {
    tapHaptic();
    const next = [...picks, i];
    setPicks(next);
    if (next.length === QUIZ.length) { setResult(scoreQuiz(next)); successHaptic(); }
    setStep(step + 1);
  };
  const save = async (id: PersonalityId) => {
    if (!profile) return router.push("/login");
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ personality: id }).eq("id", profile.id);
    setSaving(false);
    if (error) return Alert.alert("Didn't save", error.message.includes("personality") ? "This needs a quick database update (run sh update.sh)." : "Try again.");
    await refreshProfile(); successHaptic(); router.back();
  };

  const p = personalityById(result);
  const prog = Math.min(step, QUIZ.length) / QUIZ.length;

  return (
    <View style={{ flex: 1, backgroundColor: showing && p ? p.color : "#0E1215" }}>
      <Stack.Screen options={{ title: "", headerTransparent: true, headerTintColor: showing && p ? p.ink : "#fff" }} />
      {!showing ? (
        <ScrollView contentContainerStyle={{ padding: 22, paddingTop: 110, gap: 14 }}>
          <View style={s.track}><View style={[s.fill, { width: `${prog * 100}%` }]} /></View>
          <Text style={s.kicker}>QUESTION {step + 1} OF {QUIZ.length}</Text>
          <Text style={s.q}>{QUIZ[step].q}</Text>
          {QUIZ[step].answers.map((a, i) => (
            <Pressable key={a.text} onPress={() => answer(i)} style={({ pressed }) => [s.ans, pressed && { backgroundColor: "#FCE38A", transform: [{ scale: 0.98 }] }]}>
              {({ pressed }) => (<>
                <Text style={{ fontSize: 28 }}>{a.emoji}</Text>
                <Text style={[s.ansText, pressed && { color: "#1A1A1A" }]}>{a.text}</Text>
              </>)}
            </Pressable>
          ))}
        </ScrollView>
      ) : p ? (
        <ScrollView contentContainerStyle={{ padding: 22, paddingTop: 100, gap: 16, alignItems: "center" }}>
          <Text style={[s.kicker, { color: p.ink, opacity: 0.7 }]}>YOUR EV PERSONALITY</Text>
          <Animated.Text style={{ fontSize: 110, transform: [{ scale: pop }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ["-20deg", "0deg"] }) }] }}>{p.emoji}</Animated.Text>
          <Text style={[s.name, { color: p.ink }]}>{p.name}</Text>
          <Text style={[s.tag, { color: p.ink }]}>{p.tagline}</Text>
          <Text style={[s.about, { color: p.ink }]}>{p.about}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            {p.traits.map((t) => <View key={t} style={[s.trait, { borderColor: p.ink }]}><Text style={{ color: p.ink, fontWeight: "800" }}>{t}</Text></View>)}
          </View>
          <Pressable onPress={() => save(p.id)} disabled={saving} style={[s.cta, { backgroundColor: p.ink }]}>
            <Text style={{ color: p.color, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17 }}>
              {saving ? "Saving…" : profile?.personality === p.id ? "That's me ✓" : "Put it on my profile"}
            </Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 18 }}>
            <Pressable onPress={() => Share.share({ message: `I'm a ${p.emoji} ${p.name} on zingd. "${p.tagline}" What kind of EV driver are you?` })}>
              <Text style={{ color: p.ink, fontWeight: "800" }}>Share</Text>
            </Pressable>
            <Pressable onPress={() => { setPicks([]); setStep(0); }}><Text style={{ color: p.ink, fontWeight: "800" }}>Retake quiz</Text></Pressable>
          </View>
          <Text style={[s.kicker, { color: p.ink, opacity: 0.6, marginTop: 14 }]}>OR PICK ONE</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            {PERSONALITIES.map((x) => (
              <Pressable key={x.id} onPress={() => { tapHaptic(); setResult(x.id); }}
                style={[s.mini, { backgroundColor: x.color, borderColor: x.id === p.id ? p.ink : "transparent" }]}>
                <Text>{x.emoji}</Text><Text style={{ color: x.ink, fontWeight: "800", fontSize: 12.5 }}>{x.name}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: "#262D33", overflow: "hidden" },
  fill: { height: 6, backgroundColor: "#FCE38A" },
  kicker: { color: "#8A949D", fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  q: { color: "#fff", fontSize: 30, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.8, marginBottom: 6 },
  ans: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: 22, backgroundColor: "#1A2026" },
  ansText: { color: "#fff", fontSize: 17, fontWeight: "800", flex: 1 },
  name: { fontSize: 40, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -1.2, textAlign: "center" },
  tag: { fontSize: 18, fontWeight: "800", textAlign: "center", opacity: 0.85 },
  about: { fontSize: 15.5, lineHeight: 22, textAlign: "center", opacity: 0.8, maxWidth: 340 },
  trait: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  cta: { height: 56, borderRadius: 28, paddingHorizontal: 30, justifyContent: "center", marginTop: 8, alignSelf: "stretch", alignItems: "center" },
  mini: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 2 },
});
