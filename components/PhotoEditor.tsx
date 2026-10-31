import React, { useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  Blur, Canvas, Circle, ColorMatrix, FractalNoise, Group, Image as SkImage, ImageFormat, RadialGradient, Rect,
  RoundedRect, Text as SkText, matchFont, useCanvasRef, useImage, vec,
} from "@shopify/react-native-skia";
import { Directions, Gesture, GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { BLOOM_MATRIX, LOOKS, lookById, toolsFor, type CinemaTools } from "../lib/filters";
import { STATUS_LABEL } from "../lib/theme";
import type { Status } from "../lib/types";

type StickerKind = "status" | "battery" | "speed" | "charger" | "time" | "waited" | "car";
type Sticker = { kind: StickerKind; x: number; y: number };

const STATUS_COLOR: Record<Status, string> = { working: "#137F4E", busy: "#B86E00", broken: "#C5221F" };
const YELLOW = "#FFD60A";

const family = Platform.select({ ios: "Helvetica Neue", default: "sans-serif" });
const fontBig = matchFont({ fontFamily: family, fontSize: 22, fontWeight: "bold" });
const fontSmall = matchFont({ fontFamily: family, fontSize: 15, fontWeight: "bold" });
const fontTitle = matchFont({ fontFamily: family, fontSize: 40, fontWeight: "bold" });

export type EditorHandle = { exportJpeg: () => string | null; lookId: () => string };

type Props = {
  uri: string;
  status: Status;
  chargerName: string;
  speedText: string | null;
  carModel: string | null;
  editorRef: React.MutableRefObject<EditorHandle | null>;
};

/** The zap editor: cinematic looks, cinema tools, EV stickers and privacy blur, rendered with Skia. */
export default function PhotoEditor({ uri, status, chargerName, speedText, carModel, editorRef }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const W = Math.min(screenW - 24, 480, Math.round((screenH * 0.52 * 3) / 4));
  const H = Math.round((W * 4) / 3);

  const image = useImage(uri);
  const canvasRef = useCanvasRef();

  const [lookId, setLookId] = useState("cinema");
  const look = lookById(lookId);
  const [tools, setTools] = useState<CinemaTools>(toolsFor(look));
  const [mode, setMode] = useState<"looks" | "cinema" | "stickers" | "blur">("looks");
  const [battery, setBattery] = useState(80);
  const [waited, setWaited] = useState(10);
  const [blurs, setBlurs] = useState<{ x: number; y: number }[]>([]);
  const [stickers, setStickers] = useState<Sticker[]>([
    { kind: "status", x: 16, y: Math.round(H * 0.12) },
    ...(speedText ? [{ kind: "speed" as const, x: 16, y: Math.round(H * 0.84) }] : []),
  ]);
  const dragging = useRef<number | null>(null);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  const now = useMemo(() => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), []);

  const pickLook = (id: string) => {
    setLookId(id);
    setTools(toolsFor(lookById(id)));
  };

  const label = (k: StickerKind): { text: string; bg: string; big: boolean } => {
    switch (k) {
      case "status": return { text: STATUS_LABEL[status].toUpperCase(), bg: STATUS_COLOR[status], big: true };
      case "battery": return { text: `${battery}% CHARGED`, bg: "#1A73E8", big: true };
      case "speed": return { text: speedText ?? "DC FAST", bg: "#111111", big: false };
      case "charger": return { text: chargerName.slice(0, 30), bg: "#111111", big: false };
      case "time": return { text: now, bg: "#111111", big: false };
      case "waited": return { text: waited === 0 ? "NO WAIT" : `WAITED ${waited} MIN`, bg: "#B86E00", big: false };
      case "car": return { text: (carModel ?? "My EV").slice(0, 24), bg: "#5B3FB8", big: false };
    }
  };

  const box = (s: Sticker) => {
    const l = label(s.kind);
    const f = l.big ? fontBig : fontSmall;
    return { ...l, f, w: f.getTextWidth(l.text) + 26, h: l.big ? 40 : 32 };
  };

  const hit = (x: number, y: number) => {
    for (let i = stickers.length - 1; i >= 0; i--) {
      const s = stickers[i];
      const b = box(s);
      if (x >= s.x && x <= s.x + b.w && y >= s.y && y <= s.y + b.h) return i;
    }
    return null;
  };

  // Dragging only starts when the finger lands on a sticker, so swipes still change looks.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .manualActivation(true)
    .onTouchesDown((e, manager) => {
      const t0 = e.allTouches[0];
      const i = t0 ? hit(t0.x, t0.y) : null;
      dragging.current = i;
      if (i != null && t0) {
        dragOffset.current = { dx: t0.x - stickers[i].x, dy: t0.y - stickers[i].y };
        manager.activate();
      } else manager.fail();
    })
    .onUpdate((e) => {
      const i = dragging.current;
      if (i == null) return;
      const b = box(stickers[i]);
      const nx = Math.max(0, Math.min(W - b.w, e.x - dragOffset.current.dx));
      const ny = Math.max(0, Math.min(H - b.h, e.y - dragOffset.current.dy));
      setStickers((prev) => prev.map((s, j) => (j === i ? { ...s, x: nx, y: ny } : s)));
    })
    .onFinalize(() => { dragging.current = null; });

  // Swipe left or right on the photo to change looks, like a camera app.
  const stepLook = (dir: 1 | -1) => {
    if (dragging.current != null) return;
    const i = LOOKS.findIndex((l) => l.id === lookId);
    pickLook(LOOKS[Math.max(0, Math.min(LOOKS.length - 1, i + dir))].id);
  };
  const swipeLeft = Gesture.Fling().runOnJS(true).direction(Directions.LEFT).onEnd(() => stepLook(1));
  const swipeRight = Gesture.Fling().runOnJS(true).direction(Directions.RIGHT).onEnd(() => stepLook(-1));
  const swipe = Gesture.Simultaneous(swipeLeft, swipeRight);

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => { if (mode === "blur") setBlurs((b) => [...b, { x: e.x, y: e.y }]); });

  const gesture = Gesture.Race(pan, Gesture.Exclusive(swipe, tap));

  editorRef.current = {
    exportJpeg: () => {
      const snap = canvasRef.current?.makeImageSnapshot();
      return snap ? snap.encodeToBase64(ImageFormat.JPEG, 86) : null;
    },
    lookId: () => lookId,
  };

  const toggleSticker = (k: StickerKind) =>
    setStickers((prev) =>
      prev.some((s) => s.kind === k)
        ? prev.filter((s) => s.kind !== k)
        : [...prev, { kind: k, x: 16 + (prev.length % 3) * 18, y: Math.round(H * 0.12) + 48 * prev.length }],
    );

  const fit = useMemo(() => {
    if (!image) return { x: 0, y: 0, w: W, h: H };
    const iw = image.width(), ih = image.height();
    const s = Math.max(W / iw, H / ih);
    return { x: (W - iw * s) / 2, y: (H - ih * s) / 2, w: iw * s, h: ih * s };
  }, [image, W, H]);

  const vignette = tools.vignette ? look.vignette || 0.5 : 0;
  const grain = tools.grain ? look.grain || 0.2 : 0;
  const bloom = tools.glow ? look.bloom || 0.5 : 0;
  const bar = Math.round(H * 0.1);

  const STICKER_OPTIONS: { kind: StickerKind; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { kind: "status", label: "Status", icon: "pulse-outline" },
    { kind: "battery", label: "Battery %", icon: "battery-charging-outline" },
    { kind: "speed", label: "Speed", icon: "flash-outline" },
    { kind: "charger", label: "Charger name", icon: "location-outline" },
    { kind: "time", label: "Time", icon: "time-outline" },
    { kind: "waited", label: "Wait time", icon: "hourglass-outline" },
    { kind: "car", label: "My car", icon: "car-sport-outline" },
  ];
  const TOOL_OPTIONS: { key: keyof CinemaTools; label: string }[] = [
    { key: "grain", label: "Film grain" }, { key: "vignette", label: "Vignette" }, { key: "letterbox", label: "Letterbox" },
    { key: "glow", label: "Glow" }, { key: "leak", label: "Light leak" },
  ];

  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      <GestureDetector gesture={gesture}>
        <View style={{ width: W, height: H, borderRadius: 16, overflow: "hidden", backgroundColor: "#000" }}>
          <Canvas ref={canvasRef} style={{ width: W, height: H }}>
            {image && (
              <>
                <SkImage image={image} x={fit.x} y={fit.y} width={fit.w} height={fit.h} fit="fill">
                  <ColorMatrix matrix={look.matrix} />
                </SkImage>
                {bloom > 0 && (
                  <SkImage image={image} x={fit.x} y={fit.y} width={fit.w} height={fit.h} fit="fill" opacity={bloom} blendMode="screen">
                    <ColorMatrix matrix={BLOOM_MATRIX} />
                    <Blur blur={16} />
                  </SkImage>
                )}
              </>
            )}
            {look.tints.map((tn, i) => (
              <Rect key={`t${i}`} x={0} y={0} width={W} height={H} color={tn.color} blendMode={tn.blend} />
            ))}
            {tools.leak && (
              <Rect x={0} y={0} width={W} height={H} blendMode="screen">
                <RadialGradient c={vec(W * 0.88, H * 0.2)} r={W * 0.75}
                  colors={["rgba(255,150,60,0.75)", "rgba(255,90,40,0.25)", "rgba(0,0,0,0)"]} positions={[0, 0.45, 1]} />
              </Rect>
            )}
            {vignette > 0 && (
              <Rect x={0} y={0} width={W} height={H}>
                <RadialGradient c={vec(W / 2, H / 2)} r={Math.hypot(W, H) / 2}
                  colors={["rgba(0,0,0,0)", "rgba(0,0,0,0)", `rgba(0,0,0,${vignette})`]} positions={[0, 0.55, 1]} />
              </Rect>
            )}
            {grain > 0 && (
              <Rect x={0} y={0} width={W} height={H} opacity={grain} blendMode="overlay">
                <FractalNoise freqX={0.9} freqY={0.9} octaves={2} />
              </Rect>
            )}
            {image && blurs.map((b, i) => (
              <Group key={`b${i}`} clip={{ rect: { x: b.x - 34, y: b.y - 34, width: 68, height: 68 }, rx: 34, ry: 34 }}>
                <SkImage image={image} x={fit.x} y={fit.y} width={fit.w} height={fit.h} fit="fill">
                  <Blur blur={24} />
                </SkImage>
              </Group>
            ))}
            {tools.letterbox && (
              <>
                <Rect x={0} y={0} width={W} height={bar} color="#000" />
                <Rect x={0} y={H - bar} width={W} height={bar} color="#000" />
              </>
            )}
            {stickers.map((s, i) => {
              const b = box(s);
              return (
                <Group key={`${s.kind}-${i}`}>
                  <RoundedRect x={s.x} y={s.y} width={b.w} height={b.h} r={b.h / 2} color={b.bg} opacity={0.94} />
                  <SkText x={s.x + 13} y={s.y + (b.big ? 28 : 22)} text={b.text} font={b.f} color="white" />
                </Group>
              );
            })}
            {mode === "blur" && blurs.map((b, i) => (
              <Circle key={`r${i}`} cx={b.x} cy={b.y} r={34} color="rgba(255,255,255,0.6)" style="stroke" strokeWidth={1.5} />
            ))}
          </Canvas>
          {/* Look name flashes over the preview only; it is not part of the saved photo. */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <LookTitle key={lookId} text={look.name.toUpperCase()} width={W} height={H} />
          </View>
        </View>
      </GestureDetector>

      <View style={styles.tabs}>
        {(["looks", "cinema", "stickers", "blur"] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.tab, mode === m && { backgroundColor: YELLOW }]}
            accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
            <Text style={{ color: mode === m ? "#14202B" : "#A3ADB6", fontWeight: "700", fontSize: 13.5 }}>
              {m === "looks" ? "Looks" : m === "cinema" ? "Cinema" : m === "stickers" ? "Stickers" : "Blur"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ height: 118, width: "100%" }}>
        {mode === "looks" && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
            {LOOKS.map((l) => {
              const on = l.id === lookId;
              return (
                <Pressable key={l.id} onPress={() => pickLook(l.id)} style={{ alignItems: "center", gap: 6 }} accessibilityLabel={`${l.name} look`}>
                  <View style={{ borderRadius: 12, borderWidth: 2.5, borderColor: on ? YELLOW : "transparent", overflow: "hidden" }}>
                    <Canvas style={{ width: 62, height: 82 }}>
                      {image && (
                        <SkImage image={image} x={0} y={0} width={62} height={82} fit="cover">
                          <ColorMatrix matrix={l.matrix} />
                        </SkImage>
                      )}
                      {l.tints.map((tn, i) => <Rect key={i} x={0} y={0} width={62} height={82} color={tn.color} blendMode={tn.blend} />)}
                      {l.vignette > 0 && (
                        <Rect x={0} y={0} width={62} height={82}>
                          <RadialGradient c={vec(31, 41)} r={52} colors={["rgba(0,0,0,0)", `rgba(0,0,0,${l.vignette})`]} positions={[0.5, 1]} />
                        </Rect>
                      )}
                      {l.letterbox && (<><Rect x={0} y={0} width={62} height={8} color="#000" /><Rect x={0} y={74} width={62} height={8} color="#000" /></>)}
                    </Canvas>
                  </View>
                  <Text style={{ fontSize: 12, color: on ? YELLOW : "#C4CCD3", fontWeight: on ? "700" : "400" }}>{l.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {mode === "cinema" && (
          <View style={[styles.wrap, { paddingHorizontal: 16 }]}>
            {TOOL_OPTIONS.map((o) => {
              const on = tools[o.key];
              return (
                <Pressable key={o.key} onPress={() => setTools((t) => ({ ...t, [o.key]: !t[o.key] }))}
                  style={[styles.chip, { borderColor: on ? YELLOW : "#3A424A", backgroundColor: on ? "#3A3210" : "transparent" }]}
                  accessibilityState={{ selected: on }}>
                  <Text style={{ color: on ? YELLOW : "#E8ECEF", fontSize: 13.5, fontWeight: on ? "700" : "400" }}>{(on ? "✓ " : "+ ") + o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {mode === "stickers" && (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            <View style={styles.wrap}>
              {STICKER_OPTIONS.map((o) => {
                const on = stickers.some((s) => s.kind === o.kind);
                return (
                  <Pressable key={o.kind} onPress={() => toggleSticker(o.kind)}
                    style={[styles.chip, { borderColor: on ? "#8AB4F8" : "#3A424A", backgroundColor: on ? "#1D2C44" : "transparent" }]}>
                    <Ionicons name={o.icon} size={15} color={on ? "#8AB4F8" : "#A3ADB6"} />
                    <Text style={{ color: on ? "#8AB4F8" : "#E8ECEF", fontSize: 13 }}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", gap: 18, flexWrap: "wrap" }}>
              {stickers.some((s) => s.kind === "battery") && (
                <Stepper label="Battery" value={`${battery}%`} onMinus={() => setBattery((b) => Math.max(0, b - 5))} onPlus={() => setBattery((b) => Math.min(100, b + 5))} />
              )}
              {stickers.some((s) => s.kind === "waited") && (
                <Stepper label="Waited" value={`${waited} min`} onMinus={() => setWaited((w) => Math.max(0, w - 5))} onPlus={() => setWaited((w) => Math.min(180, w + 5))} />
              )}
            </View>
          </View>
        )}

        {mode === "blur" && (
          <View style={{ paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ color: "#C4CCD3", fontSize: 13.5, flex: 1, lineHeight: 19 }}>Tap the photo to blur number plates and faces before you post.</Text>
            <Pressable onPress={() => setBlurs((b) => b.slice(0, -1))} disabled={!blurs.length}
              style={[styles.chip, { borderColor: "#3A424A", opacity: blurs.length ? 1 : 0.4 }]}>
              <Ionicons name="arrow-undo-outline" size={15} color="#E8ECEF" />
              <Text style={{ color: "#E8ECEF", fontSize: 13 }}>Undo</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function LookTitle({ text, width, height }: { text: string; width: number; height: number }) {
  const [shown, setShown] = useState(true);
  React.useEffect(() => {
    const id = setTimeout(() => setShown(false), 1100);
    return () => clearTimeout(id);
  }, []);
  if (!shown) return null;
  const w = fontTitle.getTextWidth(text);
  return (
    <Canvas style={{ width, height }}>
      <SkText x={(width - w) / 2} y={height * 0.46} text={text} font={fontTitle} color="rgba(255,255,255,0.92)" />
    </Canvas>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text style={{ color: "#A3ADB6" }}>{label}</Text>
      <Pressable onPress={onMinus} style={styles.round} accessibilityLabel={`Decrease ${label}`}>
        <Ionicons name="remove" size={18} color="#E8ECEF" />
      </Pressable>
      <Text style={{ color: "#FFFFFF", fontWeight: "700", minWidth: 56, textAlign: "center", fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Pressable onPress={onPlus} style={styles.round} accessibilityLabel={`Increase ${label}`}>
        <Ionicons name="add" size={18} color="#E8ECEF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4, backgroundColor: "#1A1F24", marginHorizontal: 16, alignSelf: "stretch" },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
  round: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "#3A424A", alignItems: "center", justifyContent: "center" },
});
