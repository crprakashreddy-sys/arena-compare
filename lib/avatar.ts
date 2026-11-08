/**
 * zingd avatar maker: a cartoon of you with your EV, drawn as an SVG. No AI, no network, free.
 * The same SVG is drawn on screen (Skia) and saved as your profile photo.
 */
export type CarShape = "suv" | "hatch" | "sedan" | "scooter";
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
  { key: "suv", label: "SUV" }, { key: "hatch", label: "Hatchback" }, { key: "sedan", label: "Sedan" }, { key: "scooter", label: "Scooter" },
];

/** Guess the car shape from the driver's vehicle. */
export function shapeFor(v?: { kind: string; model: string } | null): CarShape {
  if (!v) return "suv";
  if (v.kind !== "car") return "scooter";
  if (/tiago|comet|ec3|punch/i.test(v.model)) return "hatch";
  if (/ioniq|ev6|seal|emax/i.test(v.model)) return "sedan";
  return "suv";
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

function car(shape: CarShape, col: string) {
  const dark = shade(col, 0.72), glass = "#BFE3F2", tyre = "#1A1A1A";
  const wheel = (x: number, r = 34) => `<circle cx="${x}" cy="452" r="${r}" fill="${tyre}"/><circle cx="${x}" cy="452" r="${r * 0.45}" fill="#C9CED3"/>`;
  const bolt = (x: number, y: number) => `<path d="M${x + 6} ${y} l-14 22 h10 l-6 16 l18 -24 h-10 z" fill="#FCE38A" stroke="#1A1A1A" stroke-width="2"/>`;
  if (shape === "scooter") {
    return `<path d="M120 440 C120 400 160 380 210 380 L300 380 L330 330 L352 330 L340 392 C380 396 404 420 404 446 Z" fill="${col}" stroke="${dark}" stroke-width="5"/>
      <rect x="190" y="360" width="110" height="20" rx="10" fill="#1A1A1A"/><path d="M340 330 L330 296" stroke="#1A1A1A" stroke-width="10" stroke-linecap="round"/>
      <path d="M314 292 h36" stroke="#1A1A1A" stroke-width="10" stroke-linecap="round"/>${wheel(160, 30)}${wheel(372, 30)}${bolt(244, 398)}`;
  }
  const body = {
    suv: `M48 438 L48 382 C48 362 62 350 84 348 L136 344 L176 290 C184 280 196 276 210 276 L350 276 C364 276 374 282 382 294 L414 344 L440 350 C458 354 466 366 466 384 L466 438 Z`,
    hatch: `M64 438 L64 384 C64 364 78 352 100 350 L150 346 L192 296 C200 286 210 282 224 282 L330 282 C350 282 362 292 368 306 L392 352 L420 358 C438 362 448 374 448 392 L448 438 Z`,
    sedan: `M36 438 L36 394 C36 376 50 366 72 364 L140 358 L194 310 C204 302 216 298 230 298 L320 298 C336 298 348 304 358 314 L404 360 L450 368 C470 372 478 384 478 400 L478 438 Z`,
  }[shape];
  const win = {
    suv: `<path d="M150 344 L184 298 C188 292 194 290 202 290 L262 290 L262 344 Z" fill="${glass}"/><path d="M276 290 L346 290 C354 290 360 294 364 300 L394 344 L276 344 Z" fill="${glass}"/>`,
    hatch: `<path d="M164 346 L198 304 C202 298 208 296 216 296 L268 296 L268 346 Z" fill="${glass}"/><path d="M282 296 L326 296 C338 296 346 302 350 310 L370 346 L282 346 Z" fill="${glass}"/>`,
    sedan: `<path d="M158 358 L200 320 C206 314 214 312 224 312 L268 312 L268 358 Z" fill="${glass}"/><path d="M282 312 L318 312 C330 312 338 316 346 324 L382 358 L282 358 Z" fill="${glass}"/>`,
  }[shape];
  const wx = shape === "sedan" ? [130, 390] : shape === "hatch" ? [144, 372] : [136, 384];
  return `<path d="${body}" fill="${col}" stroke="${dark}" stroke-width="5" stroke-linejoin="round"/>${win}
    <rect x="${shape === "sedan" ? 446 : shape === "hatch" ? 420 : 434}" y="372" width="26" height="12" rx="6" fill="#FFF3B0"/>
    <path d="M60 410 H460" stroke="${dark}" stroke-width="3" opacity="0.5"/>${wheel(wx[0])}${wheel(wx[1])}${bolt(266, 368)}`;
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
