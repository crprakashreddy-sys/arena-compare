import { useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import type { Charger } from "./types";
import { getGarage, plugsOf, updateVehicle, usablePowerKW, type Model, type Plug } from "./vehicles";
import { supabase } from "./supabase";
import { finishSession, startSession, updateSession, type Session } from "./sessions";
import { distanceM } from "./geo";

/**
 * Live charging estimate. Indian car makers don't share live battery data with other apps yet,
 * so zingd works it out from the starting %, the car's battery and what this charger can give.
 * Charging is quick up to 80%, then slows down, like the real thing.
 */
const EFF_FAST = 0.75, EFF_SLOW = 0.9;

function rates(s: Pick<Session, "kw" | "slowKW">) {
  const kw = s.kw ?? 7;
  return { fast: kw * EFF_FAST, slow: (s.slowKW ?? kw * 0.35) * EFF_SLOW };
}

/** Battery % after `minutes`, counting from `from` % (defaults to the starting %). */
export function pctAfter(s: Session, minutes: number, from?: number): number {
  const start = from ?? s.startPct ?? 20, cap = s.capKWh ?? 40;
  const r = rates(s);
  let pct = start, left = minutes / 60;
  if (pct < 80) {
    const hTo80 = ((80 - pct) / 100) * cap / r.fast;
    if (left <= hTo80) return Math.min(100, pct + (left * r.fast / cap) * 100);
    pct = 80; left -= hTo80;
  }
  return Math.min(100, pct + (left * r.slow / cap) * 100);
}

/** Minutes to go from `from` % (defaults to the starting %) to `to` %. */
export function minutesTo(s: Session, to: number, from?: number): number {
  const start = from ?? s.startPct ?? 20, cap = s.capKWh ?? 40;
  if (to <= start) return 0;
  const r = rates(s);
  const fastPart = Math.max(0, Math.min(to, 80) - start), slowPart = Math.max(0, to - Math.max(start, 80));
  return Math.round(((fastPart / 100) * cap / r.fast + (slowPart / 100) * cap / r.slow) * 60);
}

/** Where the estimate counts from: the driver's last reading off the car, else the start. */
function baseline(s: Session) {
  return s.calAt && s.calPct != null
    ? { at: new Date(s.calAt).getTime(), pct: s.calPct }
    : { at: new Date(s.startedAt).getTime(), pct: s.startPct ?? 20 };
}

export function liveState(s: Session, now = Date.now()) {
  const b = baseline(s);
  const mins = (now - b.at) / 60000;
  const pct = pctAfter(s, mins, b.pct);
  const target = s.targetPct ?? 80;
  const total = minutesTo(s, target, b.pct);
  const doneAt = new Date(b.at + total * 60000);
  const addedKWh = ((pct - (s.startPct ?? 20)) / 100) * (s.capKWh ?? 40);
  return { pct, target, mins, minsLeft: Math.max(0, Math.round(total - mins)), doneAt, addedKWh, reached: pct >= target - 0.5, checked: !!s.calAt };
}

// ───────── Which gun, and how fast it really is ─────────

const DC_PLUGS: Plug[] = ["ccs2", "chademo", "gbt", "bharat_dc", "leccs", "ola"];

export type Gun = { key: string; label: string; kind: "dc" | "ac"; kw: number; listedKW: number | null; crowd?: number };

/** The guns at this charger your car can use, with the power it will actually take from each. */
export function gunsFor(c: Charger, v: Model | null, stats: SpeedStats = {}): Gun[] {
  const out: Gun[] = [];
  const seen = new Set<string>();
  const add = (type: string, listed: number | null) => {
    const plug = plugsOf({ ...c, connectors: [type], guns: undefined } as Charger)[0];
    if (!plug) return;
    if (v && !v.plugs.includes(plug)) return;
    const kind: "dc" | "ac" = DC_PLUGS.includes(plug) && plug !== "leccs" ? "dc" : plug === "leccs" && (listed ?? 0) > 3.3 ? "dc" : "ac";
    const guess = listed ?? (kind === "dc" ? (c.speed === "dc" && c.powerKW ? c.powerKW : 30) : plug === "ac15a" ? 3.3 : 7.4);
    const carMax = v ? (kind === "dc" ? v.maxDcKW || v.maxAcKW : v.maxAcKW || 3.3) : guess;
    const crowd = stats[kind]?.typical_kw;
    const kw = Math.max(1, Math.min(crowd ?? guess, carMax));
    const short = type.replace(/\(.*?\)/g, "").replace(/IEC 62196-?2? ?/i, "").replace(/Type 2.*/i, "Type 2").trim().slice(0, 18) || (kind === "dc" ? "DC" : "AC");
    const key = `${short}-${Math.round(guess)}`;
    if (seen.has(key)) return; seen.add(key);
    out.push({ key, label: `${short} · ${Math.round(guess)} kW`, kind, kw, listedKW: listed, crowd });
  };
  if (c.guns?.length) c.guns.forEach((g) => add(g.type, g.kw));
  else (c.connectors ?? []).forEach((t) => add(t, null));
  return out.sort((a, b) => b.kw - a.kw);
}

export type SpeedStats = Partial<Record<"dc" | "ac", { typical_kw: number; charges: number }>>;

/** What drivers have really measured at this charger (last 90 days). */
export async function fetchSpeedStats(chargerId: string): Promise<SpeedStats> {
  const { data } = await supabase.from("charger_speed_stats").select("kind,typical_kw,charges").eq("charger_id", chargerId);
  const out: SpeedStats = {};
  (data ?? []).forEach((r: any) => { out[r.kind as "dc" | "ac"] = { typical_kw: Number(r.typical_kw), charges: r.charges }; });
  return out;
}

/**
 * "My car says 54%": re-anchor the estimate on the real reading, work out the true speed,
 * re-time the alert, and share that speed so the next driver's estimate starts closer.
 */
export async function correctPct(s: Session, pctNow: number, carModel?: string | null) {
  const b = baseline(s);
  const hours = (Date.now() - b.at) / 3600e3;
  const cap = s.capKWh ?? 40;
  let patch: Partial<Session> = { calPct: pctNow, calAt: new Date().toISOString() };
  const gained = pctNow - b.pct;
  // Only learn a speed from a fair sample: 8+ minutes, 3+ %, mostly below the 80% slow-down.
  if (hours >= 8 / 60 && gained >= 3 && b.pct < 78) {
    const batteryKW = ((gained / 100) * cap) / hours;
    const chargerKW = Math.round((batteryKW / EFF_FAST) * 10) / 10;
    const ratio = chargerKW / (s.kw ?? chargerKW);
    patch = { ...patch, kw: chargerKW, slowKW: (s.slowKW ?? chargerKW * 0.35) * ratio, measuredKW: chargerKW };
    if (s.chargerId) {
      supabase.from("charge_speeds").insert({ charger_id: s.chargerId, kind: s.gun ?? (chargerKW > 22 ? "dc" : "ac"), kw: chargerKW, car_model: carModel ?? null })
        .then(() => {}, () => {});
    }
  }
  const next = { ...s, ...patch };
  if (s.notifId) Notifications.cancelScheduledNotificationAsync(s.notifId).catch(() => {});
  updateSession(s.id, { ...patch, notifId: await scheduleDone(next) });
  return patch.measuredKW ?? null;
}

/** Start a tracked charge with a live estimate and a "nearly done" alert. */
export async function startCharge(c: Charger, v: Model | null, startPct: number, targetPct: number, gun?: Gun | null, auto = false) {
  const kw = gun?.kw ?? (v ? usablePowerKW(c, v) : (c.powerKW ?? 7));
  const kind = gun?.kind ?? (kw > 22 ? "dc" : "ac");
  // DC tapers hard above 80%; AC barely slows.
  const slowKW = kind === "dc" ? Math.max(kw * 0.35, Math.min(kw, v?.maxAcKW || kw)) : kw * 0.85;
  const s = startSession({ id: c.id, name: c.name, network: c.network }, startPct, {
    kw, slowKW, capKWh: v?.batteryKWh ?? 40, targetPct, lat: c.lat, lng: c.lng, auto, gun: kind,
  });
  const notifId = await scheduleDone(s);
  updateSession(s.id, { notifId });
  return s;
}

async function scheduleDone(s: Session): Promise<string | null> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) {
      const asked = await Notifications.requestPermissionsAsync();
      if (!asked.granted) return null;
    }
    const target = s.targetPct ?? 80;
    const left = liveState(s).minsLeft;
    if (left <= 1) return null;
    const secs = Math.max(60, (left - 5) * 60); // 5 minutes early so you can walk back
    return await Notifications.scheduleNotificationAsync({
      content: { title: `Almost ${target}% ⚡`, body: `${s.chargerName}: about 5 minutes to go. Time to head back.`, data: { url: "/log" }, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(secs) },
    });
  } catch { return null; }
}

/** Change the goal mid-charge: re-time the alert. */
export async function setTarget(s: Session, targetPct: number) {
  if (s.notifId) Notifications.cancelScheduledNotificationAsync(s.notifId).catch(() => {});
  const next = { ...s, targetPct };
  updateSession(s.id, { targetPct, notifId: await scheduleDone(next) });
}

/** Stop and log the estimate (energy and end %). */
export function stopCharge(s: Session, patch: { endPct?: number; cost?: number | null } = {}) {
  if (s.notifId) Notifications.cancelScheduledNotificationAsync(s.notifId).catch(() => {});
  const st = liveState(s);
  const endPct = patch.endPct ?? Math.round(st.pct);
  const kWh = Math.max(0, ((endPct - (s.startPct ?? 20)) / 100) * (s.capKWh ?? 40));
  finishSession(s.id, { endPct, kWh: Math.round(kWh * 10) / 10, cost: patch.cost ?? null, notifId: null });
  // The best battery reading we'll get: where this charge ended.
  const g = getGarage(); const v = g.vehicles.find((x) => x.key === g.activeKey) ?? g.vehicles[0];
  if (v) updateVehicle(v.key, { batteryPct: endPct, batteryAt: new Date().toISOString(), batterySource: "charge" });
}

/** Re-renders every `ms` so the live numbers tick. */
export function useTicker(ms = 15000) {
  const [, set] = useState(0);
  useEffect(() => { const i = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(i); }, [ms]);
}

// ───────── Spotting a charging stop ─────────

const NEAR_M = 120;       // within this of a charger
const DWELL_MS = 3 * 60e3; // stayed this long
const LEAVE_M = 400;      // drove off

/**
 * Watches where you are while the app is open. If you've stopped at a charger for 3 minutes,
 * it offers to track the charge; if you drive away mid-charge, it logs the charge for you.
 */
export function useChargeSpotter(me: { lat: number; lng: number } | null, chargers: Charger[], active: Session | null, enabled: boolean) {
  const [prompt, setPrompt] = useState<Charger | null>(null);
  const arrival = useRef<{ id: string; at: number } | null>(null);
  const dismissed = useRef(new Set<string>());
  const meRef = useRef(me); meRef.current = me;
  const listRef = useRef(chargers); listRef.current = chargers;
  const activeRef = useRef(active); activeRef.current = active;
  const [ended, setEnded] = useState<Session | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const p = meRef.current, a = activeRef.current;
      if (!p) return;
      // Drove away from an active charge: log it.
      if (a && a.lat != null && a.lng != null && distanceM(p.lat, p.lng, a.lat, a.lng) > LEAVE_M) {
        stopCharge(a); setEnded(a); return;
      }
      if (a) { setPrompt(null); return; }
      let best: Charger | null = null, bestD = Infinity;
      for (const c of listRef.current) {
        const d = distanceM(p.lat, p.lng, c.lat, c.lng);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (!best || bestD > NEAR_M) { arrival.current = null; setPrompt(null); return; }
      if (arrival.current?.id !== best.id) arrival.current = { id: best.id, at: Date.now() };
      if (Date.now() - arrival.current.at >= DWELL_MS && !dismissed.current.has(best.id)) setPrompt(best);
    };
    check();
    const i = setInterval(check, 30000);
    return () => clearInterval(i);
  }, [enabled, me?.lat, me?.lng]);

  return {
    prompt,
    ended,
    clearEnded: () => setEnded(null),
    dismiss: () => { if (prompt) dismissed.current.add(prompt.id); setPrompt(null); },
  };
}
