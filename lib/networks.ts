import { Linking, Platform } from "react-native";
/** `oem`: run by a car or scooter maker, usually at its dealerships. Many are open to every EV,
 *  some only to that brand's vehicles or app. */
export type Network = { id: string; name: string; short: string; color: string; keywords: string[]; oem?: boolean };

export const NETWORKS: Network[] = [
  { id: "tata", name: "Tata Power EZ Charge", short: "Tata Power", color: "#2D6BD8", keywords: ["tata power", "ez charge", "ezcharge"] },
  { id: "statiq", name: "Statiq", short: "Statiq", color: "#7A4FD0", keywords: ["statiq"] },
  { id: "glida", name: "GLIDA (ex-Fortum)", short: "GLIDA", color: "#0F9D74", keywords: ["glida", "fortum"] },
  { id: "jiobp", name: "Jio-bp pulse", short: "Jio-bp", color: "#D9822B", keywords: ["jio-bp", "jio bp", "jiobp", "bp pulse"] },
  { id: "chargezone", name: "ChargeZone", short: "ChargeZone", color: "#C2357A", keywords: ["chargezone", "charge zone"] },
  { id: "zeon", name: "Zeon Charging", short: "Zeon", color: "#5A9E2F", keywords: ["zeon"] },
  { id: "ather", name: "Ather Grid", short: "Ather Grid", color: "#4A5866", keywords: ["ather"], oem: true },
  { id: "kazam", name: "Kazam", short: "Kazam", color: "#B8A015", keywords: ["kazam"] },
  { id: "bolt", name: "Bolt.Earth", short: "Bolt.Earth", color: "#E04A3A", keywords: ["bolt.earth", "bolt earth"] },
  { id: "electricpe", name: "ElectricPe", short: "ElectricPe", color: "#1F95B8", keywords: ["electricpe", "electric pe"] },
  { id: "joule", name: "Joule Point", short: "Joule Point", color: "#1F7FB8", keywords: ["joule"] },
  { id: "reil", name: "REIL", short: "REIL", color: "#8C5A3C", keywords: ["reil", "rajasthan electronics"] },
  { id: "fuel", name: "Fuel-station chargers", short: "Fuel stations", color: "#9C6B3F", keywords: ["indian oil", "iocl", "hpcl", "hindustan petroleum", "bpcl", "bharat petroleum", "shell", "nayara"] },
  // Car makers' own chargers (OEM). Listed after the charging networks, so a Tata Power or
  // Statiq charger that happens to sit at a showroom keeps its network.
  { id: "tataev", name: "Tata.ev chargers", short: "Tata.ev", color: "#1B3B6F", keywords: ["tata.ev", "tata ev", "tata motors", "tata passenger electric"], oem: true },
  { id: "mahindra", name: "Mahindra charging", short: "Mahindra", color: "#C8102E", keywords: ["mahindra", "charge_in", "chargein"], oem: true },
  { id: "hyundai", name: "Hyundai charging", short: "Hyundai", color: "#002C5F", keywords: ["hyundai"], oem: true },
  { id: "mg", name: "MG charging", short: "MG", color: "#8B0000", keywords: ["mg motor", "jsw mg", "morris garages", "mg charge", "mg showroom"], oem: true },
  { id: "kia", name: "Kia charging", short: "Kia", color: "#05141F", keywords: ["kia "], oem: true },
  { id: "byd", name: "BYD charging", short: "BYD", color: "#3A6EA5", keywords: ["byd"], oem: true },
  { id: "mercedes", name: "Mercedes-Benz charging", short: "Mercedes", color: "#4A4A4A", keywords: ["mercedes"], oem: true },
  { id: "bmw", name: "BMW charging", short: "BMW", color: "#1C69D4", keywords: ["bmw"], oem: true },
  { id: "audi", name: "Audi e-tron charging", short: "Audi", color: "#6B6B6B", keywords: ["audi"], oem: true },
  { id: "volvo", name: "Volvo charging", short: "Volvo", color: "#2E4A62", keywords: ["volvo"], oem: true },
];

export const isOem = (id: string) => NETWORKS.some((n) => n.id === id && n.oem);

export const OTHER: Network = { id: "other", name: "Other public charger", short: "Other", color: "#7C8791", keywords: [] };

export function networkById(id: string): Network {
  return NETWORKS.find((n) => n.id === id) ?? OTHER;
}

export function matchNetwork(text: string): Network {
  const t = text.toLowerCase();
  return NETWORKS.find((n) => n.keywords.some((k) => t.includes(k))) ?? OTHER;
}

// Hides residential, hotel-guest, staff-only and workshop-only points. Car makers' chargers
// at dealerships are kept (they match an OEM network above).
const PRIVATE_WORDS = [
  "service center", "service centre", "workshop", "apartment", "residency", "society", "villa",
  "private", "home charger", "staff only", "employees only", "guests only",
];

export function isCommercial(name: string, address: string | null | undefined, network: string) {
  const t = `${name} ${address ?? ""}`.toLowerCase();
  if (network !== "other" && !isOem(network)) return true;
  if (PRIVATE_WORDS.some((w) => t.includes(w))) return false;
  // Unbranded points at other makers' showrooms are usually for their own customers.
  if (network === "other" && /showroom|dealer|motors|automobile/.test(t)) return false;
  return true;
}

/**
 * Open the network's own app so the driver can start and pay for the charge there.
 * Paying inside this app would need a deal with each network, so we hand over to theirs.
 * Opens a store search for the network's app (it lands on the app if installed from there).
 */
export function openNetworkApp(n: Network) {
  const q = encodeURIComponent(n.id === "other" ? "EV charging" : `${n.short} EV charging`);
  const url = Platform.OS === "android"
    ? `market://search?q=${q}&c=apps`
    : `itms-apps://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?media=software&term=${q}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://play.google.com/store/search?q=${q}&c=apps`));
}
