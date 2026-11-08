/**
 * zingd avatar maker: a cartoon of you with your EV, drawn as an SVG. No AI, no network, free.
 * The same SVG is drawn on screen (Skia) and saved as your profile photo.
 */
export type CarShape = "suv" | "boxy" | "compact" | "coupe" | "crossover" | "hatch" | "sedan" | "mpv" | "micro" | "scooter" | "bike";
export type AvatarOpts = {
  skin: number; hair: number; hairColor: number; eyes: number; mouth: number;
  glasses: boolean; beard: boolean; shirt: number; bg: number; car: CarShape; carColor: number;
};

export const SKINS = ["#FDDBB4", "#F1C27D", "#E0AC69", "#C68642", "#A0673C", "#7A4A2A"];
export const HAIR_COLORS = ["#1A1A1A", "#4A2E1C", "#8B5A2B", "#D9A441", "#B0B0B0", "#C2410C"];
export const SHIRTS = ["#1A1A1A", "#2D6BD8", "#E04A3A", "#0F9D74", "#7A4FD0", "#F2F2F2"];
export const BGS = ["#FCE38A", "#B8E0D2", "#F6C6C7", "#C9B8FF", "#A9DDF3", "#FFC371", "#9AD28A", "#1A1A1A"];
export const CAR_COLORS = ["#F2F2F2", "#1A1A1A", "#C8102E", "#2D6BD8", "#7C8791", "#0F9D74", "#FCE38A", "#F28C28"];
export const HAIR_STYLES = ["Short", "Quiff", "Long", "Bun", "Curly", "Bald"];
export const CAR_SHAPES: { key: CarShape; label: string }[] = [
  { key: "suv", label: "SUV" }, { key: "coupe", label: "Coupé SUV" }, { key: "boxy", label: "Big SUV" }, { key: "compact", label: "Compact SUV" },
  { key: "crossover", label: "Crossover" }, { key: "hatch", label: "Hatchback" }, { key: "sedan", label: "Sedan" }, { key: "mpv", label: "7-seater" },
  { key: "micro", label: "City car" }, { key: "scooter", label: "Scooter" }, { key: "bike", label: "Motorbike" },
];

/** Body type for each model in the vehicle list, so the cartoon matches the driver's EV. */
const BODY: Record<string, CarShape> = {
  "tata-nexon-ev-45": "compact", "tata-punch-ev-lr": "compact", "tata-tiago-ev-lr": "hatch", "tata-curvv-ev-55": "coupe",
  "tata-harrier-ev-75": "boxy", "mg-windsor-38": "crossover", "mg-zs-ev": "suv", "mg-comet": "micro",
  "hyundai-creta-electric": "suv", "hyundai-ioniq5": "crossover", "mahindra-xuv400": "compact", "mahindra-be6": "coupe",
  "mahindra-xev9e": "coupe", "byd-atto3": "suv", "byd-emax7": "mpv", "kia-ev6": "crossover", "citroen-ec3": "hatch",
  "revolt-rv400": "bike", "mahindra-xev9s": "boxy", "maruti-e-vitara-61": "suv", "maruti-e-vitara-49": "suv",
  "kia-carens-clavis-ev": "mpv", "tata-sierra-ev-75": "boxy", "tata-sierra-ev-63": "boxy", "vinfast-vf6": "compact",
  "vinfast-vf7": "coupe", "mg-m9": "mpv",
};
export function shapeFor(v?: { id: string; kind: string } | null): CarShape {
  if (!v) return "suv";
  return BODY[v.id] ?? (v.kind === "bike" ? "bike" : v.kind === "scooter" ? "scooter" : "suv");
}

export function randomAvatar(car: CarShape = "suv"): AvatarOpts {
  const r = (n: number) => Math.floor(Math.random() * n);
  return {
    skin: r(SKINS.length), hair: r(HAIR_STYLES.length), hairColor: r(4), eyes: r(3), mouth: r(3),
    glasses: Math.random() < 0.3, beard: Math.random() < 0.3, shirt: r(SHIRTS.length), bg: r(BGS.length - 1), car, carColor: r(CAR_COLORS.length),
  };
}

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${[c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
};

function hairBack(style: number, col: string) {
  if (style === 2) return `<path d="M168 200 C160 120 210 96 256 96 C302 96 352 120 344 200 L352 330 L160 330 Z" fill="${col}"/>`;
  if (style === 3) return `<circle cx="256" cy="98" r="34" fill="${col}"/>`;
  return "";
}
function hairFront(style: number, col: string) {
  switch (style) {
    case 0: return `<path d="M176 196 C172 128 214 108 256 108 C300 108 342 128 336 196 C320 160 290 150 256 150 C222 150 192 160 176 196 Z" fill="${col}"/>`;
    case 1: return `<path d="M176 200 C168 140 200 104 250 100 C280 92 320 96 330 120 C346 140 340 176 336 200 C324 168 300 150 270 146 L292 120 L248 140 C220 146 190 164 176 200 Z" fill="${col}"/>`;
    case 2: return `<path d="M178 206 C170 136 214 108 256 108 C300 108 342 136 334 206 C326 170 300 146 256 146 C214 146 186 170 178 206 Z" fill="${col}"/>`;
    case 3: return `<path d="M178 196 C174 132 214 112 256 112 C298 112 338 132 334 196 C318 162 292 148 256 148 C220 148 194 162 178 196 Z" fill="${col}"/>`;
    case 4: return [[196, 150, 30], [230, 124, 32], [270, 120, 32], [306, 136, 30], [326, 170, 24], [184, 180, 22], [250, 140, 30]]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/>`).join("");
    default: return "";
  }
}
function eyes(kind: number) {
  if (kind === 1) return `<path d="M214 214 q12 -12 24 0" stroke="#1A1A1A" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M274 214 q12 -12 24 0" stroke="#1A1A1A" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  if (kind === 2) return `<circle cx="226" cy="212" r="11" fill="#fff"/><circle cx="286" cy="212" r="11" fill="#fff"/><circle cx="228" cy="213" r="6.5" fill="#1A1A1A"/><circle cx="288" cy="213" r="6.5" fill="#1A1A1A"/>`;
  return `<ellipse cx="226" cy="212" rx="7" ry="9" fill="#1A1A1A"/><ellipse cx="286" cy="212" rx="7" ry="9" fill="#1A1A1A"/><circle cx="229" cy="208" r="2.5" fill="#fff"/><circle cx="289" cy="208" r="2.5" fill="#fff"/>`;
}
function mouth(kind: number) {
  if (kind === 1) return `<path d="M232 262 q24 26 48 0 z" fill="#7A1F1F"/><path d="M238 263 h36 v6 h-36 z" fill="#fff"/>`;
  if (kind === 2) return `<path d="M240 266 q16 8 32 0" stroke="#7A1F1F" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  return `<path d="M234 258 q22 22 44 0" stroke="#7A1F1F" stroke-width="7" fill="none" stroke-linecap="round"/>`;
}

type Body = { x0: number; x1: number; top: number; belt: number; rearBase: number; roofR: number; roofF: number; ws: number; r: number; inset?: number };
const BODIES: Record<string, Body> = {
  suv:       { x0: 50,  x1: 464, top: 280, belt: 350, rearBase: 64,  roofR: 98,  roofF: 318, ws: 400, r: 36 },
  boxy:      { x0: 46,  x1: 466, top: 268, belt: 346, rearBase: 54,  roofR: 72,  roofF: 334, ws: 394, r: 38 },
  compact:   { x0: 74,  x1: 442, top: 282, belt: 350, rearBase: 86,  roofR: 112, roofF: 310, ws: 382, r: 35 },
  coupe:     { x0: 42,  x1: 470, top: 286, belt: 352, rearBase: 66,  roofR: 196, roofF: 318, ws: 404, r: 37 },
  crossover: { x0: 48,  x1: 468, top: 298, belt: 358, rearBase: 60,  roofR: 112, roofF: 320, ws: 410, r: 34 },
  hatch:     { x0: 82,  x1: 438, top: 290, belt: 354, rearBase: 92,  roofR: 122, roofF: 300, ws: 372, r: 32 },
  sedan:     { x0: 34,  x1: 478, top: 306, belt: 362, rearBase: 110, roofR: 178, roofF: 318, ws: 404, r: 32 },
  mpv:       { x0: 38,  x1: 474, top: 270, belt: 348, rearBase: 46,  roofR: 64,  roofF: 352, ws: 424, r: 34 },
  micro:     { x0: 128, x1: 392, top: 268, belt: 350, rearBase: 136, roofR: 146, roofF: 330, ws: 372, r: 30, inset: 46 },
};

function car(shape: CarShape, col: string) {
  const dark = shade(col, 0.72), glass = "#BFE3F2", tyre = "#1A1A1A";
  const wheel = (x: number, r: number) => `<circle cx="${x}" cy="${452 - (36 - r) * 0.4}" r="${r}" fill="${tyre}"/><circle cx="${x}" cy="${452 - (36 - r) * 0.4}" r="${r * 0.45}" fill="#C9CED3"/>`;
  const bolt = (x: number, y: number) => `<path d="M${x + 6} ${y} l-14 22 h10 l-6 16 l18 -24 h-10 z" fill="#FCE38A" stroke="#1A1A1A" stroke-width="2"/>`;
  if (shape === "scooter") {
    return `<path d="M120 440 C120 400 160 380 210 380 L300 380 L330 330 L352 330 L340 392 C380 396 404 420 404 446 Z" fill="${col}" stroke="${dark}" stroke-width="5"/>
      <rect x="190" y="360" width="110" height="20" rx="10" fill="#1A1A1A"/><path d="M340 330 L330 296" stroke="#1A1A1A" stroke-width="10" stroke-linecap="round"/>
      <path d="M314 292 h36" stroke="#1A1A1A" stroke-width="10" stroke-linecap="round"/>${wheel(160, 30)}${wheel(372, 30)}${bolt(244, 398)}`;
  }
  if (shape === "bike") {
    return `<path d="M146 452 L236 378" stroke="#2E2E2E" stroke-width="18" stroke-linecap="round"/>
      <path d="M398 452 L350 336" stroke="#2E2E2E" stroke-width="14" stroke-linecap="round"/>
      <path d="M200 406 C200 372 240 352 290 350 L336 350 L352 384 L300 412 Z" fill="#2E2E2E"/>
      <path d="M210 356 C214 322 252 306 296 308 L340 312 L354 348 L236 366 Z" fill="${col}" stroke="${dark}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M160 352 C170 336 200 330 232 334 L240 352 Z" fill="#1A1A1A"/>
      <path d="M344 320 L366 286" stroke="#1A1A1A" stroke-width="10" stroke-linecap="round"/><path d="M352 282 h34" stroke="#1A1A1A" stroke-width="10" stroke-linecap="round"/>
      <circle cx="372" cy="322" r="13" fill="#FFF3B0" stroke="#1A1A1A" stroke-width="3"/>
      ${wheel(146, 42)}${wheel(398, 42)}${bolt(278, 318)}`;
  }
  const b = BODIES[shape] ?? BODIES.suv;
  const { x0, x1, top, belt, rearBase, roofR, roofF, ws, r } = b;
  const inset = b.inset ?? 72;
  const body = `M${x0} 438 L${x0} ${belt + 10} Q${x0} ${belt} ${rearBase} ${belt - 4} L${roofR} ${top + 4} Q${roofR + 6} ${top} ${roofR + 18} ${top}
    L${roofF - 10} ${top} Q${roofF} ${top} ${roofF + 8} ${top + 8} L${ws} ${belt - 2} L${x1 - 26} ${belt + 8} Q${x1} ${belt + 12} ${x1} ${belt + 36} L${x1} 438 Z`;
  const mid = Math.round((roofR + roofF) / 2 + 8);
  const g1 = `M${rearBase + 20} ${belt - 4} L${roofR + 8} ${top + 14} L${mid - 7} ${top + 14} L${mid - 7} ${belt - 4} Z`;
  const g2 = `M${mid + 7} ${belt - 4} L${mid + 7} ${top + 14} L${roofF - 6} ${top + 14} Q${roofF + 2} ${top + 16} ${roofF + 8} ${top + 24} L${ws - 18} ${belt - 4} Z`;
  return `<path d="${body}" fill="${col}" stroke="${dark}" stroke-width="5" stroke-linejoin="round"/>
    <path d="${g1}" fill="${glass}" stroke-linejoin="round"/><path d="${g2}" fill="${glass}" stroke-linejoin="round"/>
    <rect x="${x1 - 30}" y="${belt + 20}" width="26" height="12" rx="6" fill="#FFF3B0"/>
    <rect x="${x0 + 2}" y="${belt + 20}" width="14" height="12" rx="5" fill="#E04A3A"/>
    <path d="M${x0 + 10} ${belt + 58} H${x1 - 10}" stroke="${dark}" stroke-width="3" opacity="0.5"/>
    ${wheel(x0 + inset, r)}${wheel(x1 - inset, r)}${bolt(mid - 2, belt + 14)}`;
}

/** The finished cartoon as an SVG string, 512 × 512. */
export function avatarSvg(o: AvatarOpts): string {
  const skin = SKINS[o.skin], hair = HAIR_COLORS[o.hairColor], shirt = SHIRTS[o.shirt];
  const skinDark = shade(skin, 0.86);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BGS[o.bg]}"/>
  <circle cx="420" cy="90" r="46" fill="#fff" opacity="0.25"/><circle cx="90" cy="150" r="22" fill="#fff" opacity="0.25"/>
  <g transform="translate(0,-46)">
  ${hairBack(o.hair, hair)}
  <path d="M120 420 C120 340 180 300 256 300 C332 300 392 340 392 420 Z" fill="${shirt}"/>
  <rect x="232" y="270" width="48" height="44" rx="14" fill="${skinDark}"/>
  <circle cx="176" cy="220" r="18" fill="${skinDark}"/><circle cx="336" cy="220" r="18" fill="${skinDark}"/>
  <ellipse cx="256" cy="210" rx="80" ry="92" fill="${skin}"/>
  ${o.beard ? `<path d="M178 226 C182 290 220 304 256 304 C292 304 330 290 334 226 C318 268 296 278 256 278 C216 278 194 268 178 226 Z" fill="${hair}"/>` : ""}
  <circle cx="206" cy="246" r="13" fill="#F28B82" opacity="0.35"/><circle cx="306" cy="246" r="13" fill="#F28B82" opacity="0.35"/>
  <path d="M212 188 q14 -8 28 0" stroke="${shade(hair, 0.9)}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M272 188 q14 -8 28 0" stroke="${shade(hair, 0.9)}" stroke-width="6" fill="none" stroke-linecap="round"/>
  ${eyes(o.eyes)}
  <path d="M256 222 q-6 18 4 22" stroke="${skinDark}" stroke-width="5" fill="none" stroke-linecap="round"/>
  ${mouth(o.mouth)}
  ${o.glasses ? `<rect x="198" y="194" width="56" height="40" rx="14" fill="none" stroke="#1A1A1A" stroke-width="6"/><rect x="258" y="194" width="56" height="40" rx="14" fill="none" stroke="#1A1A1A" stroke-width="6"/><path d="M254 210 h4" stroke="#1A1A1A" stroke-width="6"/>` : ""}
  ${hairFront(o.hair, hair)}
  </g>
  ${car(o.car, CAR_COLORS[o.carColor])}
</svg>`;
}
