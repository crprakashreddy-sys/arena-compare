import { useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import type { Charger } from "./types";
import { usablePowerKW, type Model } from "./vehicles";
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

/** Battery % after `minutes` on the charger. */
export function pctAfter(s: Session, minutes: number): number {
  const start = s.startPct ?? 20, cap = s.capKWh ?? 40;
  const r = rates(s);
  let pct = start, left = minutes / 60;
  if (pct < 80) {
    const hTo80 = ((80 - pct) / 100) * cap / r.fast;
    if (left <= hTo80) return Math.min(100, pct + (left * r.fast / cap) * 100);
    pct = 80; left -= hTo80;
  }
  return Math.min(100, pct + (left * r.slow / cap) * 100);
}

/** Minutes from the start until the battery reaches `to` %. */
export function minutesTo(s: Session, to: number): number {
  const start = s.startPct ?? 20, cap = s.capKWh ?? 40;
  if (to <= start) return 0;
  const r = rates(s);
  const fastPart = Math.max(0, Math.min(to, 80) - start), slowPart = Math.max(0, to - Math.max(start, 80));
  return Math.round(((fastPart / 100) * cap / r.fast + (slowPart / 100) * cap / r.slow) * 60);
}

export function liveState(s: Session, now = Date.now()) {
  const mins = (now - new Date(s.startedAt).getTime()) / 60000;
  const pct = pctAfter(s, mins);
  const target = s.targetPct ?? 80;
  const total = minutesTo(s, target);
  const doneAt = new Date(new Date(s.startedAt).getTime() + total * 60000);
  const addedKWh = ((pct - (s.startPct ?? 20)) / 100) * (s.capKWh ?? 40);
  return { pct, target, mins, minsLeft: Math.max(0, Math.round(total - mins)), doneAt, addedKWh, reached: pct >= target - 0.5 };
}

/** Start a tracked charge with a live estimate and a "nearly done" alert. */
export async function startCharge(c: Charger, v: Model | null, startPct: number, targetPct: number, auto = false) {
  const kw = v ? usablePowerKW(c, v) : (c.powerKW ?? 7);
  const slowKW = v ? Math.max(kw * 0.35, Math.min(kw, v.maxAcKW || kw)) : kw * 0.35;
  const s = startSession({ id: c.id, name: c.name, network: c.network }, startPct, {
    kw, slowKW, capKWh: v?.batteryKWh ?? 40, targetPct, lat: c.lat, lng: c.lng, auto,
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
    const secs = Math.max(60, (minutesTo(s, target) - 5) * 60); // 5 minutes early so you can walk back
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
