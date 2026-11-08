import React, { useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  Blur, Canvas, Circle, ColorMatrix, FractalNoise, Group, Image as SkImage, ImageFormat, RadialGradient, Rect,
  RoundedRect, RuntimeShader, Text as SkText, matchFont, useCanvasRef, useImage, vec,
} from "@shopify/react-native-skia";
import { Directions, Gesture, GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "./SFIcon";
import { BLOOM_MATRIX, LOOKS, chain, contrast, lookById, mixMatrix, saturation, scale, toolsFor, type CinemaTools, type Look } from "../lib/filters";
import { ADJUST_LABELS, GRADE_EFFECT, NO_ADJUST, uniformsFor, type Adjust } from "../lib/grade";
import { Dial } from "./Dial";
import { tickHaptic } from "../lib/motion";

/** The colour grade for a look: the GPU shader when available, a simple matrix otherwise. */
function Grade({ look, amount, adj }: { look: Look; amount: number; adj: Adjust }) {
  if (GRADE_EFFECT) return <RuntimeShader source={GRADE_EFFECT} uniforms={uniformsFor(look.grade, adj, amount)} />;
  const e = Math.pow(2, adj.exposure * 0.8), w = adj.warmth * 0.07;
  return <ColorMatrix matrix={chain(mixMatrix(look.matrix, amount), contrast(1 + adj.contrast * 0.35), saturation(1 + adj.saturation * 0.6), scale(e * (1 + w), e, e * (1 - w)))} />;
}
import { STATUS_LABEL } from "../lib/theme";
import type { Status } from "../lib/types";

import { EMOJI_STICKERS, buildSticker, firstStyle, hitSticker, stylesFor, type InfoKind, type Sticker } from "./editor/stickers";
import { ZING_STICKERS, StickerView } from "./ZingStickers";
import { successHaptic, tapHaptic } from "../lib/motion";
type StickerKind = InfoKind;
const ACCENT: Record<StickerKind, string> = { status: "#137F4E", battery: "#1A73E8", speed: "#111111", charger: "#FF5A4E", time: "#111111", waited: "#E08A00", car: "#7B5CFF" };

const STATUS_COLOR: Record<Status, string> = { working: "#137F4E", busy: "#B86E00", broken: "#C5221F" };
const YELLOW = "#FCE38A";

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

/** The zing editor: cinematic looks, cinema tools, EV stickers and privacy blur, rendered with Skia. */
export default function PhotoEditor({ uri, status, chargerName, speedText, carModel, editorRef }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const W = Math.min(screenW - 24, 480, Math.round((screenH * 0.52 * 3) / 4));
  const H = Math.round((W * 4) / 3);

  const image = useImage(uri);
  const canvasRef = useCanvasRef();

  const [lookId, setLookId] = useState("cinema");
  const look = lookById(lookId);
  const [tools, setTools] = useState<CinemaTools>(toolsFor(look));
  const [mode, setMode] = useState<"looks" | "adjust" | "cinema" | "stickers" | "blur">("looks");
  const [amount, setAmount] = useState(1);
  const [adj, setAdj] = useState<Adjust>(NO_ADJUST);
  const [adjKey, setAdjKey] = useState<keyof Adjust>("exposure");
  const [battery, setBattery] = useState(80);
  const [waited, setWaited] = useState(10);
  const [blurs, setBlurs] = useState<{ x: number; y: number }[]>([]);
  const mk = (kind: Sticker["kind"], x: number, y: number, scale = 1): Sticker => ({ key: `${kind}-${Math.random().toString(36).slice(2, 7)}`, kind, style: firstStyle(kind), x, y, scale, rot: 0 });
  const [stickers, setStickers] = useState<Sticker[]>([
    mk("status", W * 0.34, H * 0.13, 0.85),
    ...(speedText ? [mk("speed", W * 0.72, H * 0.88, 0.7)] : []),
  ]);
  // Gesture state: which sticker is being handled, where the finger grabbed it, and the pinch/rotate start.
  const active = useRef<number | null>(null);
  const grab = useRef({ dx: 0, dy: 0 });
  const base = useRef({ scale: 1, rot: 0 });
  const busy = useRef({ pan: false, pinch: false, rotate: false });
  // Once every finger is off, forget the sticker so swipes change looks again.
  const release = (which: "pan" | "pinch" | "rotate") => {
    busy.current[which] = false;
    if (!busy.current.pan && !busy.current.pinch && !busy.current.rotate) setTimeout(() => { active.current = null; }, 0);
  };
  const [dragY, setDragY] = useState<number | null>(null); // finger height while dragging (for the bin)
  const binY = H - 46;
  const now = useMemo(() => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), []);

  const pickLook = (id: string) => {
    tickHaptic();
    setLookId(id);
    setAmount(1);
    setTools(toolsFor(lookById(id)));
  };

  const textFor = (k: StickerKind): string => {
    switch (k) {
      case "status": return STATUS_LABEL[status];
      case "battery": return `${battery}% CHARGED`;
      case "speed": return speedText ?? "DC FAST";
      case "charger": return chargerName.slice(0, 30);
      case "time": return now;
      case "waited": return waited === 0 ? "NO WAIT" : `WAITED ${waited} MIN`;
      case "car": return (carModel ?? "My EV").slice(0, 24);
    }
  };
  const accentFor = (k: Sticker["kind"]) => (k === "status" ? STATUS_COLOR[status] : (ACCENT as any)[k] ?? "#111");
  const built = useMemo(() => stickers.map((st) => buildSticker(st, st.kind.includes(":") ? "" : textFor(st.kind as StickerKind), accentFor(st.kind))),
    [stickers, status, battery, waited, chargerName, carModel, speedText, now]);

  const hit = (x: number, y: number) => {
    for (let i = stickers.length - 1; i >= 0; i--) {
      const b = built[i]; if (b && hitSticker(stickers[i], b, x, y)) return i;
    }
    return null;
  };
  const update = (i: number, patch: Partial<Sticker>) => setStickers((prev) => prev.map((st, j) => (j === i ? { ...st, ...patch } : st)));
  const toFront = (i: number) => { setStickers((prev) => [...prev.filter((_, j) => j !== i), prev[i]]); return stickers.length - 1; };

  // Drag a sticker; drop it on the bin at the bottom to remove it.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .manualActivation(true)
    .onTouchesDown((e, manager) => {
      const t0 = e.allTouches[0];
      const i = t0 ? hit(t0.x, t0.y) : null;
      if (i != null && t0) {
        const top = toFront(i);
        active.current = top; busy.current.pan = true;
        grab.current = { dx: t0.x - stickers[i].x, dy: t0.y - stickers[i].y };
        manager.activate();
      } else if (e.allTouches.length < 2) manager.fail();
    })
    .onUpdate((e) => {
      const i = active.current; if (i == null) return;
      update(i, { x: e.x - grab.current.dx, y: e.y - grab.current.dy });
      const near = e.y > binY - 40;
      if (near !== (dragY != null && dragY > binY - 40)) tickHaptic();
      setDragY(e.y);
    })
    .onEnd((e) => {
      const i = active.current;
      if (i != null && e.y > binY - 40 && Math.abs(e.x - W / 2) < 70) { successHaptic(); setStickers((prev) => prev.filter((_, j) => j !== i)); }
      else if (i != null) {
        // Keep it on the photo.
        setStickers((prev) => prev.map((st, j) => (j === i ? { ...st, x: Math.max(20, Math.min(W - 20, st.x)), y: Math.max(20, Math.min(H - 20, st.y)) } : st)));
      }
    })
    .onFinalize(() => { setDragY(null); release("pan"); });

  // Pinch to resize and twist to rotate the sticker under your fingers (or the last one you touched).
  const pinch = Gesture.Pinch().runOnJS(true)
    .onStart((e) => {
      busy.current.pinch = true;
      if (active.current == null) active.current = hit(e.focalX, e.focalY);
      const i = active.current; if (i != null) base.current = { ...base.current, scale: stickers[i].scale };
    })
    .onUpdate((e) => { const i = active.current; if (i != null) update(i, { scale: Math.max(0.35, Math.min(4, base.current.scale * e.scale)) }); })
    .onFinalize(() => release("pinch"));
  const rotate = Gesture.Rotation().runOnJS(true)
    .onStart(() => { busy.current.rotate = true; const i = active.current; if (i != null) base.current = { ...base.current, rot: stickers[i].rot }; })
    .onUpdate((e) => { const i = active.current; if (i != null) update(i, { rot: base.current.rot + e.rotation }); })
    .onFinalize(() => release("rotate"));

  // Swipe left or right on the photo to change looks, like a camera app.
  const stepLook = (dir: 1 | -1) => {
    if (active.current != null) return;
    const i = LOOKS.findIndex((l) => l.id === lookId);
    pickLook(LOOKS[Math.max(0, Math.min(LOOKS.length - 1, i + dir))].id);
  };
  const swipeLeft = Gesture.Fling().runOnJS(true).direction(Directions.LEFT).onEnd(() => stepLook(1));
  const swipeRight = Gesture.Fling().runOnJS(true).direction(Directions.RIGHT).onEnd(() => stepLook(-1));
  const swipe = Gesture.Simultaneous(swipeLeft, swipeRight);

  // Tap a sticker to change its look (pill → glass → script…); tap the photo to blur in Blur mode.
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      const i = hit(e.x, e.y);
      if (i != null) {
        const st = stickers[i]; const opts = stylesFor(st.kind);
        if (opts.length > 1) { tapHaptic(); update(i, { style: opts[(opts.indexOf(st.style) + 1) % opts.length] }); }
        return;
      }
      if (mode === "blur") setBlurs((b) => [...b, { x: e.x, y: e.y }]);
    });

  const gesture = Gesture.Race(
    Gesture.Simultaneous(pan, pinch, rotate),
    Gesture.Exclusive(swipe, tap),
  );

  editorRef.current = {
    exportJpeg: () => {
      const snap = canvasRef.current?.makeImageSnapshot();
      return snap ? snap.encodeToBase64(ImageFormat.JPEG, 86) : null;
    },
    lookId: () => lookId,
  };

  const toggleSticker = (k: StickerKind) => {
    tapHaptic();
    setStickers((prev) =>
      prev.some((s) => s.kind === k)
        ? prev.filter((s) => s.kind !== k)
        : [...prev, mk(k, W / 2 + ((prev.length % 3) - 1) * 24, H * (0.3 + 0.12 * (prev.length % 4)), k === "time" || k === "battery" ? 0.8 : 0.85)],
    );
  };
  const addSticker = (k: Sticker["kind"]) => { tapHaptic(); setStickers((prev) => [...prev, mk(k, W / 2, H / 2, k.startsWith("e:") ? 1 : 0.9)]); };

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
                  <Grade look={look} amount={amount} adj={adj} />
                </SkImage>
                {bloom > 0 && (
                  <SkImage image={image} x={fit.x} y={fit.y} width={fit.w} height={fit.h} fit="fill" opacity={bloom * amount} blendMode="screen">
                    <ColorMatrix matrix={BLOOM_MATRIX} />
                    <Blur blur={16} />
                  </SkImage>
                )}
              </>
            )}
            {!GRADE_EFFECT && look.tints.map((tn, i) => (
              <Rect key={`t${i}`} x={0} y={0} width={W} height={H} color={tn.color} blendMode={tn.blend} opacity={amount} />
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
            {stickers.map((st, i) => built[i] ? (
              <Group key={st.key} transform={[{ translateX: st.x }, { translateY: st.y }, { rotate: st.rot }, { scale: st.scale }]}
                opacity={dragY != null && active.current === i && dragY > binY - 40 ? 0.45 : 1}>
                {built[i]!.draw}
              </Group>
            ) : null)}
            {mode === "blur" && blurs.map((b, i) => (
              <Circle key={`r${i}`} cx={b.x} cy={b.y} r={34} color="rgba(255,255,255,0.6)" style="stroke" strokeWidth={1.5} />
            ))}
          </Canvas>
          {/* Look name flashes over the preview only; it is not part of the saved photo. */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <LookTitle key={lookId} text={look.name.toUpperCase()} width={W} height={H} />
          </View>
          {dragY != null && (
            <View pointerEvents="none" style={[styles.bin, { top: binY - 26, left: W / 2 - 26 }, dragY > binY - 40 && styles.binHot]}>
              <Ionicons name="trash-outline" size={22} color="#fff" />
            </View>
          )}
        </View>
      </GestureDetector>

      <View style={styles.tabs}>
        {(["looks", "adjust", "cinema", "stickers", "blur"] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.tab, mode === m && { backgroundColor: YELLOW }]}
            accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
            <Text style={{ color: mode === m ? "#1A1A1A" : "#A3ADB6", fontWeight: "700", fontSize: 13.5 }}>
              {m === "looks" ? "Looks" : m === "adjust" ? "Adjust" : m === "cinema" ? "Cinema" : m === "stickers" ? "Stickers" : "Blur"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ height: mode === "stickers" ? 230 : 160, width: "100%" }}>
        {mode === "looks" && (
          <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
            {LOOKS.map((l) => {
              const on = l.id === lookId;
              return (
                <Pressable key={l.id} onPress={() => pickLook(l.id)} style={{ alignItems: "center", gap: 6 }} accessibilityLabel={`${l.name} look`}>
                  <View style={{ borderRadius: 12, borderWidth: 2.5, borderColor: on ? YELLOW : "transparent", overflow: "hidden" }}>
                    <Canvas style={{ width: 62, height: 82 }}>
                      {image && (
                        <SkImage image={image} x={0} y={0} width={62} height={82} fit="cover">
                          <Grade look={l} amount={1} adj={NO_ADJUST} />
                        </SkImage>
                      )}
                      {!GRADE_EFFECT && l.tints.map((tn, i) => <Rect key={i} x={0} y={0} width={62} height={82} color={tn.color} blendMode={tn.blend} />)}
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
          {lookId !== "original" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, marginTop: 6 }}>
              <Text style={{ color: "#A3ADB6", fontSize: 12.5, fontWeight: "700", width: 64 }}>Intensity</Text>
              <Dial value={amount} onChange={setAmount} width={W - 100} from0 />
            </View>
          )}
          </>
        )}

        {mode === "adjust" && (
          <View style={{ gap: 6 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
              {ADJUST_LABELS.map((o) => {
                const on = adjKey === o.key, changed = adj[o.key] !== 0;
                return (
                  <Pressable key={o.key} onPress={() => { tickHaptic(); setAdjKey(o.key); }} style={{ alignItems: "center", gap: 4, width: 70 }}>
                    <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: on ? YELLOW : changed ? "#8A7A3A" : "#3A424A", alignItems: "center", justifyContent: "center", backgroundColor: on ? "#3A3210" : "transparent" }}>
                      {changed && !on ? <Text style={{ color: YELLOW, fontWeight: "800", fontSize: 12 }}>{(adj[o.key] > 0 ? "+" : "") + Math.round(adj[o.key] * 100)}</Text>
                        : <Ionicons name={o.icon as any} size={19} color={on ? YELLOW : "#C4CCD3"} />}
                    </View>
                    <Text style={{ color: on ? YELLOW : "#C4CCD3", fontSize: 11.5, fontWeight: on ? "700" : "400" }}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20 }}>
              <Dial value={adj[adjKey]} onChange={(v) => setAdj((a) => ({ ...a, [adjKey]: v }))} width={W - 80} />
              <Pressable onPress={() => { tickHaptic(); setAdj(NO_ADJUST); }} hitSlop={8}><Text style={{ color: "#A3ADB6", fontWeight: "700", fontSize: 12.5 }}>Reset</Text></Pressable>
            </View>
          </View>
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
          <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 6 }} nestedScrollEnabled>
            <Text style={styles.hint}>Tap a sticker to change its style · pinch to resize · twist to rotate · drag to 🗑 to remove</Text>
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
            <Text style={styles.sub}>zingd pack</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
              {ZING_STICKERS.map((z) => (
                <Pressable key={z.id} onPress={() => addSticker(`z:${z.id}`)} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.9 : 1 }] }]}>
                  <StickerView id={z.id} size={74} />
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.sub}>Emoji</Text>
            <View style={styles.wrap}>
              {EMOJI_STICKERS.map((e) => (
                <Pressable key={e} onPress={() => addSticker(`e:${e}`)} style={({ pressed }) => [styles.emoji, pressed && { transform: [{ scale: 1.2 }] }]}>
                  <Text style={{ fontSize: 28 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
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
  bin: { position: "absolute", width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 2, borderColor: "rgba(255,255,255,0.8)", alignItems: "center", justifyContent: "center" },
  binHot: { backgroundColor: "#E5483D", transform: [{ scale: 1.25 }] },
  hint: { color: "#8A949D", fontSize: 12, lineHeight: 16 },
  sub: { color: "#C4CCD3", fontSize: 12.5, fontWeight: "800", letterSpacing: 0.4, marginTop: 4 },
  emoji: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#1A1F24", alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4, backgroundColor: "#1A1F24", marginHorizontal: 16, alignSelf: "stretch" },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9, minWidth: 0 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
  round: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "#3A424A", alignItems: "center", justifyContent: "center" },
});
