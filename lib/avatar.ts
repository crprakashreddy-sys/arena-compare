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

// ── Character art, Memoji-style: soft gradients for depth, highlights in the eyes and hair. ──
function hairBack(style: number, col: string) {
  if (style === 2) return `<path d="M164 206 C150 112 206 84 256 84 C306 84 362 112 348 206 L360 336 C330 352 296 344 280 330 L232 330 C216 344 182 352 152 336 Z" fill="url(#hair)"/>`;
  if (style === 3) return `<circle cx="256" cy="92" r="38" fill="url(#hair)"/><path d="M238 76 q18 -10 34 2" stroke="#fff" stroke-opacity="0.25" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  if (style === 4) return [[178, 196, 28], [178, 238, 24], [334, 196, 28], [334, 238, 24]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#hair)"/>`).join("");
  return "";
}
function hairFront(style: number, col: string) {
  const sheen = `stroke="#fff" stroke-opacity="0.22" stroke-width="6" fill="none" stroke-linecap="round"`;
  switch (style) {
    case 0: return `<path d="M172 200 C164 124 210 100 256 100 C304 100 350 124 340 200 C332 176 316 158 292 150 C270 162 234 162 208 152 C190 162 178 178 172 200 Z" fill="url(#hair)"/><path d="M218 122 q34 -12 70 0" ${sheen}/>`;
    case 1: return `<path d="M172 206 C160 138 196 98 246 92 C270 70 336 74 344 120 C356 150 346 184 340 206 C330 172 310 152 282 146 C296 136 304 122 300 112 C282 132 240 146 208 150 C190 164 178 182 172 206 Z" fill="url(#hair)"/><path d="M262 92 q38 -8 62 18" ${sheen}/>`;
    case 2: return `<path d="M172 214 C160 132 210 100 256 100 C302 100 352 132 340 214 C330 172 308 146 270 140 C252 158 214 170 188 168 C180 182 174 196 172 214 Z" fill="url(#hair)"/><path d="M222 118 q34 -12 66 2" ${sheen}/>`;
    case 3: return `<path d="M174 198 C168 130 210 108 256 108 C302 108 344 130 338 198 C324 164 296 146 256 146 C216 146 188 164 174 198 Z" fill="url(#hair)"/><path d="M222 124 q34 -10 66 2" ${sheen}/>`;
    case 4: return [[196, 140, 30], [232, 116, 32], [274, 114, 32], [312, 132, 30], [334, 168, 24], [180, 172, 24], [254, 134, 28], [216, 146, 24], [294, 148, 24]]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#hair)"/>`).join("") + `<path d="M222 104 q30 -10 58 0" ${sheen}/>`;
    default: return `<path d="M200 118 q56 -26 112 0" stroke="#fff" stroke-opacity="0.35" stroke-width="8" fill="none" stroke-linecap="round"/>`;
  }
}
function eyes(kind: number) {
  const iris = "#5A3A22";
  const open = (cx: number, r: number) => `
    <ellipse cx="${cx}" cy="212" rx="${r + 5}" ry="${r + 7}" fill="#fff"/>
    <circle cx="${cx + 1}" cy="214" r="${r}" fill="${iris}"/><circle cx="${cx + 1}" cy="214" r="${r * 0.55}" fill="#120C08"/>
    <circle cx="${cx + 4}" cy="209" r="${r * 0.32}" fill="#fff"/><circle cx="${cx - 3}" cy="219" r="${r * 0.16}" fill="#fff" opacity="0.8"/>
    <path d="M${cx - r - 6} ${206} q${r + 6} -${r + 6} ${2 * r + 12} 0" stroke="#1A1A1A" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  if (kind === 1) return `<path d="M210 216 q16 -16 32 0" stroke="#1A1A1A" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M270 216 q16 -16 32 0" stroke="#1A1A1A" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  if (kind === 2) return open(226, 11) + open(286, 11);
  return open(226, 8.5) + open(286, 8.5);
}
function mouth(kind: number) {
  if (kind === 1) return `<path d="M228 256 q28 34 56 0 z" fill="#5E1A1A"/><path d="M234 257 h44 q-2 8 -6 10 h-32 q-4 -2 -6 -10 z" fill="#fff"/><path d="M244 278 q12 -8 24 0 q-12 6 -24 0 z" fill="#E86A6A"/>`;
  if (kind === 2) return `<path d="M238 266 q18 6 38 -6" stroke="#8A3B3B" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  return `<path d="M232 256 q24 24 48 0" stroke="#8A3B3B" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M240 266 q16 6 32 0" stroke="#E07A7A" stroke-opacity="0.5" stroke-width="4" fill="none" stroke-linecap="round"/>`;
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
  const dark = shade(col, 0.72), glass = "url(#glass)", tyre = "#1A1A1A";
  const paint = `<defs><linearGradient id="paint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(col, 1.18)}"/><stop offset="0.55" stop-color="${col}"/><stop offset="1" stop-color="${shade(col, 0.74)}"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#DDF2FB"/><stop offset="1" stop-color="#7FB3CC"/></linearGradient></defs>`;
  const wheel = (x: number, r: number) => {
    const y = 452 - (36 - r) * 0.4;
    const spokes = [0, 72, 144, 216, 288].map((a) => { const t = (a * Math.PI) / 180; return `<path d="M${x} ${y} L${(x + Math.cos(t) * r * 0.42).toFixed(1)} ${(y + Math.sin(t) * r * 0.42).toFixed(1)}" stroke="#8C949B" stroke-width="3.5" stroke-linecap="round"/>`; }).join("");
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${tyre}"/><circle cx="${x}" cy="${y}" r="${r * 0.5}" fill="#D9DEE2"/>${spokes}<circle cx="${x}" cy="${y}" r="${r * 0.12}" fill="#5A6168"/>`;
  };
  const bolt = (x: number, y: number) => `<path d="M${x + 6} ${y} l-14 22 h10 l-6 16 l18 -24 h-10 z" fill="#FCE38A" stroke="#1A1A1A" stroke-width="2"/>`;
  if (shape === "scooter") {
    return `${paint}<path d="M120 440 C120 400 160 380 210 380 L300 380 L330 330 L352 330 L340 392 C380 396 404 420 404 446 Z" fill="${col}" stroke="${dark}" stroke-width="5"/>
      <rect x="190" y="360" width="110" height="20" rx="10" fill="#1A1A1A"/><path d="M340 330 L330 296" stroke="#1A1A1A" stroke-width="10" stroke-linecap="round"/>
      <path d="M314 292 h36" stroke="#1A1A1A" stroke-width="10" stroke-linecap="round"/>${wheel(160, 30)}${wheel(372, 30)}${bolt(244, 398)}`;
  }
  if (shape === "bike") {
    return `${paint}<path d="M146 452 L236 378" stroke="#2E2E2E" stroke-width="18" stroke-linecap="round"/>
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
  return `${paint}<path d="${body}" fill="url(#paint)" stroke="${dark}" stroke-width="5" stroke-linejoin="round"/>
    <path d="${g1}" fill="${glass}" stroke-linejoin="round"/><path d="${g2}" fill="${glass}" stroke-linejoin="round"/>
    <path d="M${mid + 22} ${belt - 8} L${mid + 52} ${top + 18}" stroke="#fff" stroke-opacity="0.55" stroke-width="9" stroke-linecap="round"/>
    <path d="M${x0 + 20} ${belt + 6} H${x1 - 40}" stroke="#fff" stroke-opacity="0.35" stroke-width="4" stroke-linecap="round"/>
    <rect x="${x1 - 30}" y="${belt + 20}" width="26" height="12" rx="6" fill="#FFF3B0"/>
    <rect x="${x0 + 2}" y="${belt + 20}" width="14" height="12" rx="5" fill="#E04A3A"/>
    <path d="M${x0 + 10} ${belt + 58} H${x1 - 10}" stroke="${dark}" stroke-width="3" opacity="0.5"/>
    ${wheel(x0 + inset, r)}${wheel(x1 - inset, r)}${bolt(mid - 2, belt + 14)}`;
}

/** The finished cartoon as an SVG string, 512 × 512. */
export function avatarSvg(o: AvatarOpts): string {
  const skin = SKINS[o.skin], hair = HAIR_COLORS[o.hairColor], shirt = SHIRTS[o.shirt], bg = BGS[o.bg];
  const skinDark = shade(skin, 0.82), skinLight = shade(skin, 1.08), hairDark = shade(hair, 0.7), hairLight = shade(hair, 1.35);
  const dark = o.bg === BGS.length - 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.38" r="0.75"><stop offset="0" stop-color="${shade(bg, dark ? 2.2 : 1.12)}"/><stop offset="1" stop-color="${shade(bg, 0.9)}"/></radialGradient>
    <radialGradient id="face" cx="0.4" cy="0.32" r="0.8"><stop offset="0" stop-color="${skinLight}"/><stop offset="0.7" stop-color="${skin}"/><stop offset="1" stop-color="${skinDark}"/></radialGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${hairLight}"/><stop offset="0.5" stop-color="${hair}"/><stop offset="1" stop-color="${hairDark}"/></linearGradient>
    <linearGradient id="shirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(shirt, 1.15)}"/><stop offset="1" stop-color="${shade(shirt, 0.78)}"/></linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="256" cy="210" r="170" fill="#fff" opacity="${dark ? 0.05 : 0.18}"/>
  <path d="M84 96 l6 14 l14 6 l-14 6 l-6 14 l-6 -14 l-14 -6 l14 -6 z" fill="#fff" opacity="0.7"/>
  <path d="M430 150 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z" fill="#fff" opacity="0.6"/>
  <g transform="translate(0,-40)">
  ${hairBack(o.hair, hair)}
  <path d="M110 430 C112 350 176 310 256 310 C336 310 400 350 402 430 Z" fill="url(#shirt)"/>
  <path d="M226 312 L256 350 L286 312" fill="none" stroke="${shade(shirt, 0.65)}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M232 262 h48 v56 q-24 16 -48 0 z" fill="${skinDark}"/>
  <path d="M232 284 q24 16 48 0" stroke="${shade(skin, 0.7)}" stroke-opacity="0.45" stroke-width="10" fill="none"/>
  <ellipse cx="176" cy="222" rx="17" ry="22" fill="${skinDark}"/><ellipse cx="336" cy="222" rx="17" ry="22" fill="${skinDark}"/>
  <ellipse cx="178" cy="222" rx="7" ry="11" fill="${shade(skin, 0.7)}" opacity="0.5"/><ellipse cx="334" cy="222" rx="7" ry="11" fill="${shade(skin, 0.7)}" opacity="0.5"/>
  <path d="M256 112 C312 112 340 154 338 214 C336 270 300 304 256 304 C212 304 176 270 174 214 C172 154 200 112 256 112 Z" fill="url(#face)"/>
  ${o.beard ? `<path d="M180 230 C184 292 222 310 256 310 C290 310 328 292 332 230 C320 262 300 276 256 276 C212 276 192 262 180 230 Z" fill="url(#hair)" opacity="0.92"/><path d="M234 258 q22 10 44 0" stroke="${hairDark}" stroke-width="10" stroke-linecap="round" fill="none"/>` : ""}
  <ellipse cx="204" cy="250" rx="16" ry="10" fill="#FF7B7B" opacity="0.28"/><ellipse cx="308" cy="250" rx="16" ry="10" fill="#FF7B7B" opacity="0.28"/>
  <path d="M206 186 q20 -14 40 -2" stroke="${hairDark}" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M266 184 q20 -12 40 2" stroke="${hairDark}" stroke-width="8" fill="none" stroke-linecap="round"/>
  ${eyes(o.eyes)}
  <path d="M258 222 q-8 18 2 24 q6 2 10 -2" stroke="${shade(skin, 0.72)}" stroke-width="5" fill="none" stroke-linecap="round"/>
  <circle cx="262" cy="230" r="3" fill="#fff" opacity="0.45"/>
  ${mouth(o.mouth)}
  ${o.glasses ? `<rect x="194" y="192" width="60" height="44" rx="18" fill="#BFE3F2" fill-opacity="0.18" stroke="#1A1A1A" stroke-width="6"/><rect x="258" y="192" width="60" height="44" rx="18" fill="#BFE3F2" fill-opacity="0.18" stroke="#1A1A1A" stroke-width="6"/><path d="M254 210 h4" stroke="#1A1A1A" stroke-width="6"/><path d="M204 202 l14 -6" stroke="#fff" stroke-opacity="0.6" stroke-width="4" stroke-linecap="round"/>` : ""}
  ${hairFront(o.hair, hair)}
  </g>
  <ellipse cx="256" cy="466" rx="220" ry="16" fill="#000" opacity="0.18"/>
  ${car(o.car, CAR_COLORS[o.carColor])}
</svg>`;
}
