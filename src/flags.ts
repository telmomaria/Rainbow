import * as THREE from 'three';

/**
 * Real country flags, drawn on a canvas (Telmo, 2026-11-19: "as bandeiras dos países estão erradas" — before, every
 * flag used Portugal's layout with other colours). Simplified where a coat of arms would be (Portugal, Spain, Mexico)
 * but the layout, colours and proportions are the real ones, so a child recognises them.
 * Keyed by CITIES[].name. Canvas 300×200 (3:2); flags with other real ratios are drawn in that box.
 */

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;

const vert = (cols: string[], weights?: number[]): Draw => (c, w, h) => {
  const ws = weights ?? cols.map(() => 1);
  const sum = ws.reduce((a, b) => a + b, 0);
  let x = 0;
  cols.forEach((col, i) => {
    const cw = (ws[i] / sum) * w;
    c.fillStyle = col;
    c.fillRect(Math.floor(x), 0, Math.ceil(cw) + 1, h);
    x += cw;
  });
};
const horiz = (cols: string[], weights?: number[]): Draw => (c, w, h) => {
  const ws = weights ?? cols.map(() => 1);
  const sum = ws.reduce((a, b) => a + b, 0);
  let y = 0;
  cols.forEach((col, i) => {
    const ch = (ws[i] / sum) * h;
    c.fillStyle = col;
    c.fillRect(0, Math.floor(y), w, Math.ceil(ch) + 1);
    y += ch;
  });
};
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.4;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}
const nordic = (field: string, cross: string, border?: string): Draw => (c, w, h) => {
  c.fillStyle = field;
  c.fillRect(0, 0, w, h);
  const cx = w * 0.36;
  const t = h * (border ? 0.22 : 0.16);
  if (border) {
    c.fillStyle = border;
    c.fillRect(cx - t / 2, 0, t, h);
    c.fillRect(0, h / 2 - t / 2, w, t);
  }
  const t2 = border ? t * 0.5 : t;
  c.fillStyle = cross;
  c.fillRect(cx - t2 / 2, 0, t2, h);
  c.fillRect(0, h / 2 - t2 / 2, w, t2);
};

const FLAGS: Record<string, Draw> = {
  // Portugal: green 2/5, red 3/5, yellow armillary sphere with the shield (simplified)
  Porto: (c, w, h) => {
    vert(['#046a38', '#da291c'], [2, 3])(c, w, h);
    const x = w * 0.4;
    const y = h / 2;
    c.strokeStyle = '#ffe900';
    c.lineWidth = 7;
    c.beginPath();
    c.arc(x, y, h * 0.26, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(x, y, h * 0.26, h * 0.1, 0, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#ffffff';
    c.fillRect(x - h * 0.11, y - h * 0.13, h * 0.22, h * 0.24);
    c.fillStyle = '#da291c';
    c.fillRect(x - h * 0.085, y - h * 0.105, h * 0.17, h * 0.19);
    c.fillStyle = '#ffffff';
    c.fillRect(x - h * 0.05, y - h * 0.06, h * 0.1, h * 0.1);
    c.fillStyle = '#003399';
    c.fillRect(x - h * 0.03, y - h * 0.04, h * 0.06, h * 0.06);
  },
  Roma: vert(['#009246', '#ffffff', '#ce2b37']),
  // Spain: red, yellow (double), red + a small simplified coat of arms on the hoist side
  Madrid: (c, w, h) => {
    horiz(['#aa151b', '#f1bf00', '#aa151b'], [1, 2, 1])(c, w, h);
    c.fillStyle = '#aa151b';
    c.fillRect(w * 0.22, h * 0.36, w * 0.1, h * 0.28);
    c.fillStyle = '#c8a100';
    c.fillRect(w * 0.2, h * 0.31, w * 0.14, h * 0.06);
  },
  // United Kingdom: Union Flag
  Londres: (c, w, h) => {
    c.fillStyle = '#012169';
    c.fillRect(0, 0, w, h);
    c.save();
    c.lineCap = 'butt';
    c.strokeStyle = '#ffffff';
    c.lineWidth = h * 0.2;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(w, h);
    c.moveTo(w, 0);
    c.lineTo(0, h);
    c.stroke();
    // red diagonals are counterchanged (offset like a pinwheel): in each quadrant the red sits 1/30 of the height
    // off the centre line — below it in the top hoist quadrant, above it in the top fly quadrant, and so on
    c.strokeStyle = '#c8102e';
    c.lineWidth = h * 0.066;
    const off = h / 30;
    for (const [qx, qy] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      const cx = qx * w;
      const cy = qy * h;
      const len = Math.hypot(w, h) / 2;
      const nx = (cy - h / 2) / len; // n = (dy, -dx) for the arm d from the centre to this corner
      const ny = -(cx - w / 2) / len;
      c.save();
      c.beginPath();
      c.rect(qx * (w / 2), qy * (h / 2), w / 2, h / 2);
      c.clip();
      c.beginPath();
      c.moveTo(w / 2 + nx * off, h / 2 + ny * off);
      c.lineTo(cx + (cx - w / 2) * 0.1 + nx * off, cy + (cy - h / 2) * 0.1 + ny * off); // past the corner: no gap
      c.stroke();
      c.restore();
    }
    c.restore();
    c.fillStyle = '#ffffff';
    c.fillRect(w / 2 - h * 0.17, 0, h * 0.34, h);
    c.fillRect(0, h / 2 - h * 0.17, w, h * 0.34);
    c.fillStyle = '#c8102e';
    c.fillRect(w / 2 - h * 0.1, 0, h * 0.2, h);
    c.fillRect(0, h / 2 - h * 0.1, w, h * 0.2);
  },
  Paris: vert(['#0055a4', '#ffffff', '#ef4135']),
  'Varsóvia': horiz(['#ffffff', '#dc143c']),
  Vilnius: horiz(['#fdb913', '#006a44', '#c1272d']),
  Moscovo: horiz(['#ffffff', '#0039a6', '#d52b1e']),
  // China: red, one big yellow star and four small ones turned to it
  Pequim: (c, w, h) => {
    c.fillStyle = '#ee1c25';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffde00';
    const u = h / 20;
    star(c, 5 * u, 5 * u, 3 * u);
    for (const [x, y] of [
      [10, 2],
      [12, 4],
      [12, 7],
      [10, 9],
    ]) {
      const a = Math.atan2(5 * u - y * u, 5 * u - x * u);
      star(c, x * u, y * u, u, a + Math.PI / 2);
    }
  },
  'Tóquio': (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#bc002d';
    c.beginPath();
    c.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2);
    c.fill();
  },
  // Brazil: green, yellow rhombus, blue globe with a white band and little stars
  'Rio de Janeiro': (c, w, h) => {
    c.fillStyle = '#009c3b';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffdf00';
    c.beginPath();
    c.moveTo(w * 0.085, h / 2);
    c.lineTo(w / 2, h * 0.12);
    c.lineTo(w * 0.915, h / 2);
    c.lineTo(w / 2, h * 0.88);
    c.closePath();
    c.fill();
    c.fillStyle = '#002776';
    c.beginPath();
    c.arc(w / 2, h / 2, h * 0.25, 0, Math.PI * 2);
    c.fill();
    c.save();
    c.beginPath();
    c.arc(w / 2, h / 2, h * 0.25, 0, Math.PI * 2);
    c.clip();
    c.strokeStyle = '#ffffff';
    c.lineWidth = h * 0.045;
    c.beginPath();
    c.arc(w / 2 - h * 0.05, h * 1.05, h * 0.62, Math.PI * 1.25, Math.PI * 1.75);
    c.stroke();
    c.restore();
    c.fillStyle = '#ffffff';
    for (const [dx, dy] of [
      [-0.1, 0.08],
      [0.05, 0.12],
      [0.12, 0.05],
      [-0.02, 0.17],
      [0.15, 0.14],
    ])
      star(c, w / 2 + dx * h, h / 2 + dy * h, h * 0.018);
  },
  // Mexico: green, white, red + a simple emblem (eagle on a cactus, as a brown/green badge)
  'Cidade do México': (c, w, h) => {
    vert(['#006847', '#ffffff', '#ce1126'])(c, w, h);
    c.fillStyle = '#8b5a2b';
    c.beginPath();
    c.ellipse(w / 2, h * 0.47, h * 0.1, h * 0.12, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#006847';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(w / 2, h * 0.5, h * 0.17, Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
  },
  Reiquiavique: nordic('#02529c', '#dc1e35', '#ffffff'),
  // Greenland: white over red, a disc half red (top) half white (bottom), toward the hoist
  Nuuk: (c, w, h) => {
    horiz(['#ffffff', '#d00c33'])(c, w, h);
    const x = w * 0.35;
    const r = h * 0.33;
    c.fillStyle = '#d00c33';
    c.beginPath();
    c.arc(x, h / 2, r, Math.PI, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x, h / 2, r, 0, Math.PI);
    c.fill();
  },
  // USA: 13 stripes and a blue canton with stars
  'Estados Unidos': (c, w, h) => {
    for (let i = 0; i < 13; i++) {
      c.fillStyle = i % 2 === 0 ? '#b22234' : '#ffffff';
      c.fillRect(0, Math.floor((i * h) / 13), w, Math.ceil(h / 13) + 1);
    }
    const cw = w * 0.4;
    const ch = (h * 7) / 13;
    c.fillStyle = '#3c3b6e';
    c.fillRect(0, 0, cw, ch);
    c.fillStyle = '#ffffff';
    for (let row = 0; row < 9; row++) {
      const n = row % 2 === 0 ? 6 : 5;
      for (let col = 0; col < n; col++) {
        const x = ((col + (row % 2 === 0 ? 0.5 : 1)) * cw) / 6;
        const y = ((row + 0.5) * ch) / 9;
        star(c, x, y, ch * 0.04);
      }
    }
  },
};

const cache = new Map<string, THREE.CanvasTexture>();

/** The flag of the country of `city` as a texture (null if unknown, e.g. the Moon). */
export function flagTexture(city: string): THREE.CanvasTexture | null {
  const draw = FLAGS[city];
  if (!draw) return null;
  const hit = cache.get(city);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 200;
  const c = canvas.getContext('2d')!;
  draw(c, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(city, tex);
  return tex;
}

/** QA: every city that has a flag. */
export const FLAG_CITIES = Object.keys(FLAGS);
