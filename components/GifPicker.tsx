import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "./SFIcon";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { gifsReady, searchGifs, searchStickers, trendingGifs, trendingStickers, type Gif } from "../lib/gifs";
import { ZING_STICKERS, StickerView } from "./ZingStickers";
import { tapHaptic, tickHaptic } from "../lib/motion";

type Tab = "zing" | "gifs" | "stickers";
export type Pick = { gif_url: string } | { sticker: string };

const QUICK = ["charging", "electric car", "road trip", "yay", "thank you", "lol", "waiting", "fast", "mind blown", "facepalm"];

/** One sheet for everything fun: zingd's own stickers, GIPHY GIFs and GIPHY stickers. */
export function GifPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (p: Pick) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>("zing");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Gif[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (!visible || tab === "zing" || !gifsReady) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true); setErr(null);
      try {
        const term = q.trim();
        setItems(tab === "gifs" ? await (term ? searchGifs(term) : trendingGifs()) : await (term ? searchStickers(term) : trendingStickers()));
      } catch (e: any) { setErr(e.message); setItems([]); }
      setBusy(false);
    }, q ? 350 : 0);
    return () => clearTimeout(timer.current);
  }, [visible, tab, q]);

  const pick = (p: Pick) => { tapHaptic(); onPick(p); onClose(); };
  const cols = tab === "gifs" ? 2 : 3;
  const cell = (width - 24 - (cols - 1) * 6) / cols;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: t.bg, height: height * 0.62, paddingBottom: insets.bottom }]}>
        <View style={[s.grab, { backgroundColor: t.line }]} />
        <View style={s.tabs}>
          {([["zing", "zingd"], ["gifs", "GIFs"], ["stickers", "Stickers"]] as [Tab, string][]).map(([k, label]) => (
            <Pressable key={k} onPress={() => { tickHaptic(); setTab(k); }} style={[s.tab, { backgroundColor: tab === k ? CTA : t.surface }]}>
              <Text style={{ color: tab === k ? ON_CTA : t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "zing" ? (
          <FlatList
            data={ZING_STICKERS}
            keyExtractor={(x) => x.id}
            numColumns={3}
            contentContainerStyle={{ padding: 12, gap: 6 }}
            columnWrapperStyle={{ gap: 6 }}
            renderItem={({ item }) => (
              <Pressable onPress={() => pick({ sticker: item.id })} style={({ pressed }) => [{ width: (width - 36) / 3, alignItems: "center", paddingVertical: 4 }, pressed && { transform: [{ scale: 0.9 }] }]}>
                <StickerView id={item.id} size={(width - 36) / 3 - 8} />
              </Pressable>
            )}
          />
        ) : !gifsReady ? (
          <View style={{ padding: 24, gap: 8, alignItems: "center" }}>
            <Text style={{ fontSize: 40 }}>🎞️</Text>
            <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17 }}>GIFs are almost ready</Text>
            <Text style={{ color: t.muted, textAlign: "center", lineHeight: 20 }}>Add a free GIPHY key to switch them on. Until then, try the zingd stickers.</Text>
          </View>
        ) : (
          <>
            <View style={[s.search, { backgroundColor: t.surface }]}>
              <Ionicons name="search" size={17} color={t.muted} />
              <TextInput value={q} onChangeText={setQ} placeholder={tab === "gifs" ? "Search GIFs" : "Search stickers"} placeholderTextColor={t.faint}
                style={{ flex: 1, color: t.text, fontSize: 15 }} returnKeyType="search" autoCorrect={false} />
              {!!q && <Pressable onPress={() => setQ("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={t.muted} /></Pressable>}
            </View>
            {!q && (
              <FlatList horizontal data={QUICK} keyExtractor={(x) => x} showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingBottom: 8 }} style={{ flexGrow: 0 }}
                renderItem={({ item }) => (
                  <Pressable onPress={() => setQ(item)} style={[s.chip, { backgroundColor: t.surface }]}><Text style={{ color: t.text, fontWeight: "700", fontSize: 13 }}>{item}</Text></Pressable>
                )} />
            )}
            {busy && !items.length ? <ActivityIndicator style={{ marginTop: 30 }} color={t.muted} /> : err ? (
              <Text style={{ color: t.muted, textAlign: "center", padding: 24 }}>{err}</Text>
            ) : (
              <FlatList
                key={`${tab}-${cols}`}
                data={items}
                keyExtractor={(x) => x.id}
                numColumns={cols}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingBottom: 8 }}
                columnWrapperStyle={{ gap: 6 }}
                ListEmptyComponent={<Text style={{ color: t.muted, textAlign: "center", padding: 24 }}>Nothing for "{q}". Try another word.</Text>}
                renderItem={({ item }) => (
                  <Pressable onPress={() => pick({ gif_url: item.url })} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                    <Image source={{ uri: item.preview }} style={{ width: cell, height: tab === "gifs" ? cell * (item.h / item.w) : cell, borderRadius: 12, backgroundColor: tab === "gifs" ? t.surface : "transparent" }}
                      contentFit={tab === "gifs" ? "cover" : "contain"} autoplay />
                  </Pressable>
                )}
              />
            )}
            <Text style={[s.powered, { color: t.muted }]}>Powered by GIPHY</Text>
          </>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" },
  grab: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, marginTop: 8 },
  tabs: { flexDirection: "row", gap: 8, padding: 12 },
  tab: { flex: 1, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 42, borderRadius: 21, paddingHorizontal: 14, marginHorizontal: 12, marginBottom: 8 },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: "center" },
  powered: { textAlign: "center", fontSize: 11, fontWeight: "800", letterSpacing: 0.5, paddingVertical: 6 },
});
