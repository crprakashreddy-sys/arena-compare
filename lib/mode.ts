import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CATALOG, plugsOf, useGarage } from "./vehicles";
import type { Charger } from "./types";

/** Which world the app shows: cars and their chargers, or 2-wheelers and theirs. */
export type Mode = "car" | "two";
const KEY = "zingd.mode.v1";
let mode: Mode | null = null;
let chosen = false; // the driver picked a mode by hand
let lastVehicle: string | null = null; // the active vehicle we last followed
const subs = new Set<(m: Mode) => void>();

AsyncStorage.getItem(KEY).then((v) => {
  if (v === "car" || v === "two") { mode = v; chosen = true; subs.forEach((f) => f(v)); }
}).catch(() => {});

export function setMode(m: Mode) {
  mode = m; chosen = true;
  subs.forEach((f) => f(m));
  AsyncStorage.setItem(KEY, m).catch(() => {});
}

/** The current mode. Until the driver picks one, it follows the vehicle they're driving. */
export function useMode(): [Mode, (m: Mode) => void] {
  const { active } = useGarage();
  const fallback: Mode = active && active.kind !== "car" ? "two" : "car";
  const [m, setM] = useState<Mode>(mode ?? fallback);
  useEffect(() => {
    subs.add(setM);
    return () => { subs.delete(setM); };
  }, []);
  // Switching the active vehicle to another kind switches the app with it.
  useEffect(() => {
    if (!active || active.key === lastVehicle) return;
    const first = lastVehicle === null;
    lastVehicle = active.key;
    if (first && chosen) return; // keep the saved choice when the app opens
    const k: Mode = active.kind === "car" ? "car" : "two";
    mode = k; subs.forEach((f) => f(k));
  }, [active?.key]);
  return [mode ?? m ?? fallback, setMode];
}

const CAR_PLUGS = new Set(["ccs2", "type2", "chademo", "gbt", "bharat_dc", "bharat_ac"]);
const TWO_PLUGS = new Set(["leccs", "ola", "ac15a"]);

/** Whether a charger suits cars, 2-wheelers, or both. Chargers with no plug info count for both. */
export function suits(c: Pick<Charger, "connectors" | "network">, m: Mode) {
  const p = plugsOf(c as Charger);
  if (!p.length) return true;
  return m === "car" ? p.some((x) => CAR_PLUGS.has(x)) : p.some((x) => TWO_PLUGS.has(x));
}

const TWO_MAKES = new Set(CATALOG.filter((v) => v.kind !== "car").map((v) => v.make.toLowerCase()));
const CAR_MAKES = new Set(CATALOG.filter((v) => v.kind === "car").map((v) => v.make.toLowerCase()));

/** Which side a club belongs to. Driver-made clubs show on both. */
export function clubSuits(c: { kind: string; make: string; vehicle_kind: string | null }, m: Mode) {
  if (c.kind === "custom") return true;
  if (c.kind === "model") return m === "car" ? c.vehicle_kind === "car" : c.vehicle_kind !== "car";
  const make = c.make.toLowerCase();
  return m === "car" ? CAR_MAKES.has(make) : TWO_MAKES.has(make);
}

export const MODE_LABEL: Record<Mode, string> = { car: "🚗 Cars", two: "🛵 2-wheelers" };
