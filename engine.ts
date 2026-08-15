// engine.ts - 3D bar renderer (adjustable camera) + rotating cube + profile card.
// All animation is baked into the SVG so it plays as an image on GitHub.
// Bars/segments use CSS; the cube uses SMIL (both work in an <img> SVG).

export type AnimStyle = "sweep" | "wave" | "bounce" | "drop" | "build" | "none";
export type Orientation = "iso" | "skyline" | "angled" | "topdown";

export interface RenderOptions {
  U?: [number, number]; V?: [number, number]; orientation?: Orientation;
  levelHeight?: number; minHeight?: number; gap?: number; padding?: number;
  background?: string | null; radius?: number; palette?: string[]; emptyColor?: string;
  levels?: number; animStyle?: AnimStyle; animDuration?: number; animStagger?: number;
  animLoop?: boolean; animHold?: number; animGap?: number;
  originX?: number; originY?: number;
}

const PRESETS: Record<Orientation, { U: [number, number]; V: [number, number] }> = {
  iso:     { U: [9, 4.5],   V: [-9, 4.5] },
  angled:  { U: [11, 2.6],  V: [-5, 6.2] },
  skyline: { U: [9.5, 1.4], V: [-4.5, 7] },
  topdown: { U: [8, 6],     V: [-8, 6] },
};

const DEF = {
  levelHeight: 60, minHeight: 4, gap: 0.14, padding: 28,
  background: "#0d1117" as string | null, radius: 16,
  palette: ["#0e4429", "#006d32", "#26a641", "#39d353", "#7ff59a"],
  emptyColor: "#161b22", levels: 5,
  animStyle: "build" as AnimStyle, animDuration: 0.28, animStagger: 0.007,
  animLoop: true, animHold: 1.1, animGap: 0.45,
};

// ---- colour helpers ----
function h2r(h: string): [number, number, number] { h = h.replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function r2h(r: number, g: number, b: number) { const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); return `#${c(r)}${c(g)}${c(b)}`; }
function shade(hex: string, a: number) { const [r, g, b] = h2r(hex); const t = a < 0 ? 0 : 255, p = Math.abs(a); return r2h(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p); }
function luminance(hex: string) { const [r, g, b] = h2r(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

// ---- vector helpers ----
type Pt = [number, number];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
const pl = (pts: Pt[]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- bar animation CSS ----

// Longest animation-delay handed out by renderBars, so the looping keyframes can
// wait for the whole wave to finish building before the teardown wave starts.
export function staggerSpan(grid: number[][], o: { animStyle: AnimStyle; animStagger: number }): number {
  if (o.animStyle === "wave" || o.animStyle === "none") return 0;
  const rows = grid.length, cols = Math.max(0, ...grid.map(r => r.length));
  if (!rows || !cols) return 0;
  const steps = o.animStyle === "build" ? rows * cols - 1 : (rows - 1) + (cols - 1);
  return Math.max(0, steps) * o.animStagger;
}

export function styleBlock(
  o: { animStyle: AnimStyle; animDuration: number; animLoop?: boolean; animHold?: number; animGap?: number },
  span = 0,
): string {
  const d = o.animDuration;
  // bars animate for everyone (the spinning cube already ignores reduce-motion,
  // so this keeps them consistent). To respect the setting again, restore:
  // const common = `@media (prefers-reduced-motion:reduce){.bar{animation:none!important;opacity:1!important;transform:none!important}}`;
  const common = "";
  if (o.animStyle === "wave")
    return `.bar{transform-box:fill-box;animation:bob ${Math.max(2, d * 4).toFixed(2)}s ease-in-out infinite}@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}${common}`;
  if (o.animStyle === "none") return "";
  if (o.animLoop === false) return onceStyle(o.animStyle, d, common);

  // One cycle per bar: build in, hold while the rest of the wave catches up,
  // tear down with the same motion reversed, then idle before looping.
  // Every bar shares the cycle length and is offset by its animation-delay, so
  // the build and teardown both read as one wave sweeping across the grid.
  const hold = o.animHold ?? 1.1, gap = o.animGap ?? 0.45;
  const outStart = span + d + hold;
  const T = outStart + d + span + gap;
  const at = (t: number) => (100 * t / T).toFixed(2) + "%";
  const IN = "cubic-bezier(.34,1.56,.64,1)";   // overshoot on the way in
  const OUT = "cubic-bezier(.5,-.3,.75,.4)";   // anticipate, then snap away
  const ease = (fn: string) => `animation-timing-function:${fn}`;

  // in: 0 -> d, hold: d -> outStart, out: outStart -> outStart+d, idle: -> T
  // Opacity lands early on the way in and leaves late on the way out, so the
  // scale/translate motion stays readable at both ends.
  const kf = (name: string, from: string, to: string) =>
    `@keyframes ${name}{` +
    `0%{opacity:0;transform:${from};${ease(IN)}}` +
    `${at(d * 0.6)}{opacity:1}` +
    `${at(d)}{opacity:1;transform:${to};${ease("linear")}}` +
    `${at(outStart)}{opacity:1;transform:${to};${ease(OUT)}}` +
    `${at(outStart + d * 0.45)}{opacity:1}` +
    `${at(outStart + d)}{opacity:0;transform:${from};${ease("linear")}}` +
    `100%{opacity:0;transform:${from}}}`;

  const bar = (name: string, origin = true) =>
    `.bar{transform-box:fill-box;${origin ? "transform-origin:bottom center;" : ""}` +
    `opacity:0;animation:${name} ${T.toFixed(2)}s linear infinite backwards}`;

  switch (o.animStyle) {
    case "build":  return bar("place") + kf("place", "scale(0)", "scale(1)") + common;
    case "bounce": return bar("pop") + kf("pop", "scaleY(0)", "scaleY(1)") + common;
    case "drop":   return bar("fall", false) + kf("fall", "translateY(-46px)", "translateY(0)") + common;
    case "sweep":  return bar("rise", false) + kf("rise", "translateY(16px)", "translateY(0)") + common;
    default: return "";
  }
}

// original play-once behaviour, kept for animLoop:false
function onceStyle(style: AnimStyle, d: number, common: string): string {
  switch (style) {
    case "build": return `.bar{transform-box:fill-box;transform-origin:bottom center;opacity:0;animation:place ${d}s cubic-bezier(.34,1.56,.64,1) forwards}@keyframes place{0%{opacity:0;transform:scale(0)}60%{opacity:1}100%{opacity:1;transform:scale(1)}}${common}`;
    case "bounce": return `.bar{transform-box:fill-box;transform-origin:bottom center;opacity:0;animation:pop ${d}s cubic-bezier(.34,1.56,.64,1) forwards}@keyframes pop{0%{opacity:0;transform:scaleY(0)}55%{opacity:1}100%{opacity:1;transform:scaleY(1)}}${common}`;
    case "drop": return `.bar{opacity:0;animation:fall ${d}s cubic-bezier(.3,1.5,.5,1) forwards}@keyframes fall{0%{opacity:0;transform:translateY(-46px)}55%{opacity:1}100%{opacity:1;transform:translateY(0)}}${common}`;
    case "sweep": return `.bar{opacity:0;animation:rise ${d}s cubic-bezier(.2,.7,.3,1) forwards}@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}${common}`;
    default: return "";
  }
}

// ---- 3D bars ----
export function renderBars(grid: number[][], options: RenderOptions = {}) {
  const o = { ...DEF, ...options };
  const rows = grid.length;
  const pre = PRESETS[o.orientation ?? "iso"];
  const U = o.U ?? pre.U, V = o.V ?? pre.V;
  const maxCount = Math.max(1, ...grid.flat());
  const heightOf = (c: number) => (c <= 0 ? 0 : o.minHeight + (c / maxCount) * (o.levelHeight - o.minHeight));
  const levelOf = (c: number) => (c <= 0 ? 0 : Math.min(o.levels, Math.ceil((c / maxCount) * o.levels)));

  type Cell = { count: number; c: Pt; drawKey: number; chrono: number; depth: number };
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < grid[row].length; col++) {
      const c = add(mul(U, col + 0.5), mul(V, row + 0.5));
      cells.push({ count: grid[row][col], c, drawKey: c[1], chrono: col * rows + row, depth: col + row });
    }
  cells.sort((a, b) => a.drawKey - b.drawKey || a.c[0] - b.c[0]);

  const hu = mul(U, 0.5 * (1 - o.gap)), hv = mul(V, 0.5 * (1 - o.gap));
  const shapes: string[] = [];
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
  const trk = (p: Pt) => { mnX = Math.min(mnX, p[0]); mnY = Math.min(mnY, p[1]); mxX = Math.max(mxX, p[0]); mxY = Math.max(mxY, p[1]); };

  for (const cell of cells) {
    const { c, count, depth, chrono } = cell;
    const h = heightOf(count), up: Pt = [0, -h];
    const P1 = sub(sub(c, hu), hv), P2 = sub(add(c, hu), hv), P3 = add(add(c, hu), hv), P4 = add(sub(c, hu), hv);
    const T1 = add(P1, up), T2 = add(P2, up), T3 = add(P3, up), T4 = add(P4, up);
    [P1, P2, P3, P4, T1, T2, T3, T4].forEach(trk);
    const lvl = levelOf(count);
    let cLight: string, cMid: string, cDark: string;
    if (lvl === 0) { cMid = o.emptyColor; cLight = shade(o.emptyColor, 0.06); cDark = shade(o.emptyColor, -0.25); }
    else { const b = o.palette[Math.min(lvl - 1, o.palette.length - 1)]; cLight = shade(b, 0.22); cMid = b; cDark = shade(b, -0.28); }
    const walls = [
      { pts: [P1, P2, T2, T1], fill: cMid, key: (P1[1] + P2[1]) / 2 },
      { pts: [P2, P3, T3, T2], fill: cDark, key: (P2[1] + P3[1]) / 2 },
      { pts: [P3, P4, T4, T3], fill: cMid, key: (P3[1] + P4[1]) / 2 },
      { pts: [P4, P1, T1, T4], fill: cDark, key: (P4[1] + P1[1]) / 2 },
    ].sort((a, b) => a.key - b.key);
    let faces = "";
    for (const w of walls) faces += `<polygon points="${pl(w.pts)}" fill="${w.fill}"/>`;
    faces += `<polygon points="${pl([T1, T2, T3, T4])}" fill="${cLight}"/>`;
    const delay = o.animStyle === "wave" ? -(depth * o.animStagger) : o.animStyle === "build" ? chrono * o.animStagger : depth * o.animStagger;
    shapes.push(o.animStyle === "none" ? `<g>${faces}</g>` : `<g class="bar" style="animation-delay:${delay.toFixed(2)}s">${faces}</g>`);
  }
  const ox = o.originX ?? (o.padding - mnX), oy = o.originY ?? (o.padding - mnY);
  const width = Math.ceil(mxX - mnX + o.padding * 2), height = Math.ceil(mxY - mnY + o.padding * 2);
  const group = `<g transform="translate(${ox.toFixed(1)},${oy.toFixed(1)})">\n${shapes.join("\n")}\n</g>`;
  return { group, width, height, contentW: mxX - mnX, contentH: mxY - mnY };
}

export function renderContrib3D(grid: number[][], options: RenderOptions = {}): string {
  const o = { ...DEF, ...options };
  const { group, width, height } = renderBars(grid, options);
  const style = o.animStyle !== "none" ? `<style>${styleBlock(o, staggerSpan(grid, o))}</style>` : "";
  const bg = o.background != null ? `<rect width="${width}" height="${height}" rx="${o.radius}" fill="${o.background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${style}${bg}${group}</svg>`;
}

// ---- rotating 3D cube (SMIL, works as an image on GitHub) ----
type V3 = [number, number, number];
const rotY = (p: V3, a: number): V3 => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
const rotX = (p: V3, a: number): V3 => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
const norm3 = (p: V3): V3 => { const m = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / m, p[1] / m, p[2] / m]; };

export interface CubeFace { points: string; fill: string; front: boolean; }
export function computeCube(cx: number, cy: number, scale: number, tiltDeg: number, thetaDeg: number, base: string): CubeFace[] {
  const tilt = tiltDeg * Math.PI / 180, th = thetaDeg * Math.PI / 180;
  const Vs: V3[] = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const faces: { idx: number[]; n: V3 }[] = [
    { idx: [4,5,6,7], n: [0,0,1] }, { idx: [1,0,3,2], n: [0,0,-1] },
    { idx: [5,1,2,6], n: [1,0,0] }, { idx: [0,4,7,3], n: [-1,0,0] },
    { idx: [3,2,6,7], n: [0,1,0] }, { idx: [0,1,5,4], n: [0,-1,0] },
  ];
  const light = norm3([-0.4, 0.85, 0.6]);
  const proj = (p: V3): [number, number, number] => { let q = rotY(p, th); q = rotX(q, tilt); return [cx + q[0] * scale, cy - q[1] * scale, q[2]]; };
  const out: CubeFace[] = [];
  for (const f of faces) {
    const p2 = f.idx.map(i => proj(Vs[i]));
    let area = 0; for (let k = 0; k < 4; k++) { const a = p2[k], b = p2[(k + 1) % 4]; area += a[0] * b[1] - b[0] * a[1]; }
    const front = area > 0; // screen y is flipped, so CW-in-math = front
    let nr = rotY(f.n, th); nr = rotX(nr, tilt); nr = norm3(nr);
    const b = Math.max(0, nr[0] * light[0] + nr[1] * light[1] + nr[2] * light[2]);
    const fill = shade(base, (b - 0.5) * 0.7);
    out.push({ points: p2.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" "), fill, front });
  }
  return out;
}

export function renderCube(cx: number, cy: number, scale: number, opts: { base?: string; tilt?: number; dur?: number; frames?: number; start?: number } = {}): string {
  const base = opts.base ?? "#39d353", tilt = opts.tilt ?? 30, dur = opts.dur ?? 9, N = opts.frames ?? 48, start = opts.start ?? 25;
  const pts: string[][] = Array.from({ length: 6 }, () => []);
  const fills: string[][] = Array.from({ length: 6 }, () => []);
  const ops: string[][] = Array.from({ length: 6 }, () => []);
  for (let i = 0; i <= N; i++) { // include full turn so it loops seamlessly
    const fs = computeCube(cx, cy, scale, tilt, start + (i / N) * 360, base);
    fs.forEach((f, k) => { pts[k].push(f.points); fills[k].push(f.fill); ops[k].push(f.front ? "1" : "0"); });
  }
  let g = `<g>`;
  for (let k = 0; k < 6; k++) {
    g += `<polygon points="${pts[k][0]}" fill="${fills[k][0]}" opacity="${ops[k][0]}">` +
      `<animate attributeName="points" dur="${dur}s" repeatCount="indefinite" values="${pts[k].join(";")}"/>` +
      `<animate attributeName="fill" dur="${dur}s" repeatCount="indefinite" values="${fills[k].join(";")}"/>` +
      `<animate attributeName="opacity" dur="${dur}s" repeatCount="indefinite" calcMode="discrete" values="${ops[k].join(";")}"/>` +
      `</polygon>`;
  }
  return g + `</g>`;
}

// ---- profile card (split layout) ----
export interface Lang { name: string; pct: number; color: string; short?: string }
export interface ProfileData {
  name: string; handle: string; location?: string; intro?: string;
  title?: string; tech?: string;
  stats: { label: string; value: string }[];
  langs: Lang[];
}
const shortOf = (l: Lang) => l.short ?? (l.name === "C#" ? "C#" : l.name.slice(0, 2).toUpperCase());

export function renderProfileCard(grid: number[][], data: ProfileData, options: RenderOptions = {}): string {
  const o = { ...DEF, ...options };
  const W = 1000, pad = 34, divX = 690;
  const MAIN = "#e6edf3", MUTED = "#7d8590", ACCENT = "#39d353", CARD = o.background ?? "#0d1117";
  const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
  const Lw = divX - pad - 18;            // left content width
  const animated = o.animStyle !== "none";

  // ---- left: header + intro ----
  let left = `<g class="fade">` +
    `<text x="${pad}" y="52" font-family="${FONT}" font-size="28" font-weight="700" fill="${MAIN}">${esc(data.name)}</text>` +
    `<text x="${pad}" y="74" font-family="${FONT}" font-size="14" fill="${MUTED}">@${esc(data.handle)}${data.location ? "  ·  " + esc(data.location) : ""}</text>`;
  if (data.intro) left += `<text x="${pad}" y="98" font-family="${FONT}" font-size="13.5" fill="${ACCENT}">${esc(data.intro)}</text>`;
  left += `</g>`;

  // ---- left: stats ----
  const n = data.stats.length, colW = Lw / n;
  left += `<g class="fade">` + data.stats.map((s, i) => {
    const x = pad + i * colW + colW / 2;
    return `<text x="${x}" y="146" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="700" fill="${MAIN}">${esc(s.value)}</text>` +
           `<text x="${x}" y="164" text-anchor="middle" font-family="${FONT}" font-size="10.5" fill="${MUTED}" letter-spacing="0.4">${esc(s.label.toUpperCase())}</text>`;
  }).join("") + `</g>`;

  // ---- left: city ----
  const city = renderBars(grid, { ...options, padding: 0, background: null });
  const cityTop = 182;
  const scale = Math.min(1.05, Lw / city.contentW);
  const cityH = city.contentH * scale;
  const cityX = pad + (Lw - city.contentW * scale) / 2;
  left += `<g transform="translate(${cityX.toFixed(1)},${cityTop}) scale(${scale.toFixed(3)})">${city.group}</g>`;

  // ---- left: language bar (animated fill) + icon-badge legend ----
  const barY = cityTop + cityH + 26, barW = Lw, barH = 16;
  const total = data.langs.reduce((a, l) => a + l.pct, 0) || 1;
  let cx = pad;
  const segs = data.langs.map((l, i) => {
    const w = (l.pct / total) * barW;
    const r = `<rect class="seg" style="animation-delay:${(0.5 + i * 0.12).toFixed(2)}s" x="${cx.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barH}" fill="${l.color}"/>`;
    cx += w; return r;
  }).join("");
  const legY = barY + barH + 30, legW = Lw / data.langs.length;
  const legend = data.langs.map((l, i) => {
    const x = pad + i * legW, tc = luminance(l.color) > 150 ? "#0d1117" : "#ffffff";
    return `<rect x="${x}" y="${legY - 14}" width="28" height="18" rx="5" fill="${l.color}"/>` +
      `<text x="${x + 14}" y="${legY - 1}" text-anchor="middle" font-family="${FONT}" font-size="10" font-weight="700" fill="${tc}">${esc(shortOf(l))}</text>` +
      `<text x="${x + 36}" y="${legY}" font-family="${FONT}" font-size="12.5" fill="${MAIN}">${esc(l.name)} <tspan fill="${MUTED}">${l.pct}%</tspan></text>`;
  }).join("");
  left += `<g class="fade"><clipPath id="lb"><rect x="${pad}" y="${barY}" width="${barW}" height="${barH}" rx="8"/></clipPath>` +
    `<g clip-path="url(#lb)">${segs}</g>${legend}</g>`;

  const H = Math.ceil(legY + 26);

  // ---- right: rotating cube + title ----
  const xc = (divX + (W - pad)) / 2;
  const cubeCy = Math.round(H * 0.40);
  const cube = renderCube(xc, cubeCy, 46, { base: ACCENT, tilt: 30, dur: 9 });
  const titleY = cubeCy + 110;
  const right =
    cube +
    `<g class="fade">` +
    `<text x="${xc}" y="${titleY}" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="700" fill="${MAIN}">${esc(data.title ?? "3D Developer")}</text>` +
    (data.tech ? `<text x="${xc}" y="${titleY + 24}" text-anchor="middle" font-family="${FONT}" font-size="12.5" fill="${MUTED}">${esc(data.tech)}</text>` : "") +
    `</g>`;

  const divider = `<line x1="${divX}" y1="30" x2="${divX}" y2="${H - 30}" stroke="#20262d" stroke-width="1"/>`;

  const fadeCss = animated ? `.fade{opacity:0;animation:fadein .7s ease .2s forwards}@keyframes fadein{to{opacity:1}}` : "";
  const segCss = animated ? `.seg{transform-box:fill-box;transform-origin:left center;transform:scaleX(0);animation:grow .5s cubic-bezier(.3,.8,.3,1) forwards}@keyframes grow{to{transform:scaleX(1)}}` : "";
  const style = `<style>${styleBlock(o, staggerSpan(grid, o))}${fadeCss}${segCss}</style>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    style +
    `<rect width="${W}" height="${H}" rx="18" fill="${CARD}"/>` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="17" fill="none" stroke="#20262d"/>` +
    divider + left + right +
    `</svg>`;
}