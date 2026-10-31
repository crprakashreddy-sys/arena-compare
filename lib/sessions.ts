import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

/** Charging log, kept on this phone only. */

export type Session = {
  id: string;
  chargerId: string | null;
  chargerName: string;
  network: string;
  startedAt: string;
  endedAt: string | null;   // null while charging
  kWh: number | null;
  cost: number | null;      // rupees
  startPct: number | null;
  endPct: number | null;
};

type Store = { sessions: Session[] };
const KEY = "sessions.v1";
let store: Store = { sessions: [] };
let loaded = false;
const subs = new Set<(s: Store) => void>();

async function load() {
  if (!loaded) {
    try { const raw = await AsyncStorage.getItem(KEY); if (raw) store = JSON.parse(raw); } catch {}
    loaded = true;
  }
  return store;
}
function save(next: Store) {
  store = next;
  subs.forEach((f) => f(store));
  AsyncStorage.setItem(KEY, JSON.stringify(store)).catch(() => {});
}

export function startSession(c: { id: string | null; name: string; network: string }, startPct: number | null = null) {
  const s: Session = {
    id: Date.now().toString(36), chargerId: c.id, chargerName: c.name, network: c.network,
    startedAt: new Date().toISOString(), endedAt: null, kWh: null, cost: null, startPct, endPct: null,
  };
  // Only one charge runs at a time.
  save({ sessions: [s, ...store.sessions.map((x) => (x.endedAt ? x : { ...x, endedAt: s.startedAt }))] });
  return s;
}

export function finishSession(id: string, patch: Partial<Session>) {
  save({ sessions: store.sessions.map((s) => (s.id === id ? { ...s, endedAt: s.endedAt ?? new Date().toISOString(), ...patch } : s)) });
}

export function addPastSession(s: Omit<Session, "id">) {
  save({ sessions: [{ ...s, id: Date.now().toString(36) }, ...store.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) });
}

export function deleteSession(id: string) {
  save({ sessions: store.sessions.filter((s) => s.id !== id) });
}

export function useSessions() {
  const [s, setS] = useState(store);
  useEffect(() => {
    subs.add(setS);
    load().then((x) => setS({ ...x }));
    return () => { subs.delete(setS); };
  }, []);
  const active = s.sessions.find((x) => !x.endedAt) ?? null;
  return { sessions: s.sessions, active };
}

/** Totals for the current calendar month. */
export function monthTotals(sessions: Session[], now = new Date()) {
  const m = sessions.filter((s) => {
    const d = new Date(s.startedAt);
    return s.endedAt && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const kWh = m.reduce((a, s) => a + (s.kWh ?? 0), 0);
  const cost = m.reduce((a, s) => a + (s.cost ?? 0), 0);
  return { count: m.length, kWh, cost, perKWh: kWh > 0 ? cost / kWh : null };
}

export const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
