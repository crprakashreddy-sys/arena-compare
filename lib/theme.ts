import { useColorScheme } from "react-native";

const light = {
  bg: "#FFFFFF",
  surface: "#F2F4F6",
  text: "#14202B",
  muted: "#5F6B76",
  faint: "#98A2AC",
  line: "#E2E6EA",
  accent: "#1A73E8",
  accentSoft: "#E8F0FE",
  good: "#137F4E",
  goodSoft: "#E3F4EA",
  warn: "#9A5B00",
  warnSoft: "#FDF1DC",
  bad: "#C5221F",
  badSoft: "#FCE8E6",
  star: "#E8A317",
};

const dark: typeof light = {
  bg: "#111417",
  surface: "#1C2126",
  text: "#E8ECEF",
  muted: "#A3ADB6",
  faint: "#6E7882",
  line: "#2A3037",
  accent: "#8AB4F8",
  accentSoft: "#1D2C44",
  good: "#6DD39A",
  goodSoft: "#173524",
  warn: "#F2B860",
  warnSoft: "#3A2A10",
  bad: "#F28B82",
  badSoft: "#3D1C1A",
  star: "#F6BF3B",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

export const STATUS_LABEL = { working: "Working", busy: "Busy / queue", broken: "Not working" } as const;

export function statusColors(t: Theme) {
  return {
    working: { fg: t.good, bg: t.goodSoft },
    busy: { fg: t.warn, bg: t.warnSoft },
    broken: { fg: t.bad, bg: t.badSoft },
  } as const;
}
