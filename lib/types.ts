export type Speed = "dc" | "ac" | "dcac" | "unknown";
export type Status = "working" | "busy" | "broken";

export type Charger = {
  id: string;
  name: string;
  network: string;
  lat: number;
  lng: number;
  address?: string | null;
  powerKW?: number | null;
  connectors?: string[];
  speed: Speed;
  source: "ocm" | "seed" | "community";
};

export type Profile = {
  id: string;
  display_name: string;
  car_model: string | null;
  city: string | null;
  vehicle_verified: boolean;
};

export type ConnectionState = "none" | "sent" | "received" | "connected";

export type ScorePart = { label: string; points: number };

export type Checkin = {
  id: string;
  charger_id: string;
  user_id: string;
  status: Status;
  note: string | null;
  photo_path: string | null;
  created_at: string;
  expires_at: string;
  distance_m?: number | null;
  issue?: string | null;
  zap_score?: number;
  score_breakdown?: ScorePart[];
  profiles?: { display_name: string; car_model: string | null } | null;
  chargers?: { name: string; lat: number; lng: number; network: string } | null;
};

export type Review = {
  id: string;
  charger_id: string;
  user_id: string;
  rating: number;
  tags: string[];
  body: string | null;
  created_at: string;
  profiles?: { display_name: string; car_model: string | null } | null;
  helpful: number;
  votedByMe: boolean;
};

export type FacilityKey =
  | "washroom" | "cafe" | "parking" | "open_24x7" | "covered"
  | "security" | "accessible" | "wifi" | "waiting_area";

export type FacilitySummary = { facility: FacilityKey; yes: number; no: number };

export type FoodPlace = {
  id: string;
  name: string;
  kind: string;
  cuisine?: string;
  lat: number;
  lng: number;
  distanceM: number;
};

export type FoodTip = {
  id: string;
  user_id: string;
  name: string;
  note: string | null;
  created_at: string;
  profiles?: { display_name: string } | null;
};

export type LiveStatus = { status: Status; reports: number; lastAt: string };
