import type { AgarEngine } from './engine';
import { CELL_COLORS, FOOD_COLORS, WORLD_SIZE, type Cell, type Food, type Preferences, type SkinId } from './types';

const TAU = Math.PI * 2;
const SHADE_CACHE = new Map<string, string>();
const shade = (hex: string, factor: number) => {
  const key = hex + factor;
  let cached = SHADE_CACHE.get(key);
  if (!cached) {
    const value = Number.parseInt(hex.slice(1), 16);
    cached = `rgb(${Math.round((value >> 16) * factor)},${Math.round(((value >> 8) & 255) * factor)},${Math.round((value & 255) * factor)})`;
    SHADE_CACHE.set(key, cached);
  }
  return cached;
};

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, radius), 0, TAU);
}

const CELL_STEPS = 64;
const CELL_COS = new Float32Array(CELL_STEPS + 1);
const CELL_SIN = new Float32Array(CELL_STEPS + 1);
const CELL_ANGLE_5 = new Float32Array(CELL_STEPS + 1);
const CELL_ANGLE_3 = new Float32Array(CELL_STEPS + 1);
for (let i = 0; i <= CELL_STEPS; i++) {
  const angle = (i / CELL_STEPS) * TAU;
  CELL_COS[i] = Math.cos(angle);
  CELL_SIN[i] = Math.sin(angle);
  CELL_ANGLE_5[i] = angle * 5;
  CELL_ANGLE_3[i] = angle * 3;
}

function cellPath(ctx: CanvasRenderingContext2D, radius: number, time: number, seed: number, organic: boolean) {
  ctx.beginPath();
  if (!organic) { ctx.arc(0, 0, radius, 0, TAU); return; }
  const phase1 = time * 0.6 + seed;
  const phase2 = -time * 0.8 + seed;
  const wobbleFactor = Math.min(2.1, radius / 42);
  for (let i = 0; i <= CELL_STEPS; i++) {
    const offset = (Math.sin(CELL_ANGLE_5[i] + phase1) * 0.5 + Math.sin(CELL_ANGLE_3[i] + phase2) * 0.6) * wobbleFactor;
    const r = radius + offset;
    const px = CELL_COS[i] * r;
    const py = CELL_SIN[i] * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function paintSkin(ctx: CanvasRenderingContext2D, radius: number, skin: SkinId, color: string, time = 0) {
  ctx.save();
  circle(ctx, 0, 0, radius);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.scale(radius / 100, radius / 100);
  if (skin === 'earth') {
    ctx.fillStyle = '#619fdb';
    ctx.fillRect(-100, -100, 200, 200);
    ctx.fillStyle = '#8cce94';
    const continents = [
      [-93, -52, -64, -70, -35, -62, -14, -42, -25, -17, -52, -9, -63, 7, -76, 0, -93, -26],
      [-50, 7, -23, 12, -7, 35, -24, 67, -36, 94, -47, 65, -40, 37, -59, 20],
      [8, -67, 38, -83, 82, -65, 94, -44, 77, -22, 53, -28, 43, -4, 14, -11, -1, -34],
      [10, -17, 38, -13, 48, 14, 35, 46, 21, 69, 3, 45, -8, 4],
      [70, 42, 94, 47, 109, 71, 87, 83, 65, 75],
    ];
    for (const points of continents) {
      ctx.beginPath();
      points.forEach((value, i) => { if (i % 2 === 0) { if (i === 0) ctx.moveTo(value, points[i + 1]); else ctx.lineTo(value, points[i + 1]); } });
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 46, 100, 0, 0, TAU);
    ctx.stroke();
  } else if (skin === 'melon') {
    ctx.fillStyle = '#79b86e';
    ctx.fillRect(-100, -100, 200, 200);
    circle(ctx, 0, 0, 88); ctx.fillStyle = '#e8e8a4'; ctx.fill();
    circle(ctx, 0, 0, 80); ctx.fillStyle = '#f08691'; ctx.fill();
    ctx.fillStyle = '#805747';
    for (let i = 0; i < 13; i++) {
      const angle = i * 2.4;
      const r = 22 + (i % 3) * 18;
      ctx.beginPath(); ctx.ellipse(Math.cos(angle) * r, Math.sin(angle) * r, 3, 6, angle, 0, TAU); ctx.fill();
    }
  } else if (skin === 'smile') {
    ctx.fillStyle = '#f3c866'; ctx.fillRect(-100, -100, 200, 200);
    ctx.fillStyle = '#685031';
    circle(ctx, -29, -17, 8); ctx.fill(); circle(ctx, 29, -17, 8); ctx.fill();
    ctx.strokeStyle = '#685031'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, 47, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = '#e99a74';
    circle(ctx, -52, 16, 13); ctx.fill(); circle(ctx, 52, 16, 13); ctx.fill();
  } else if (skin === 'planet') {
    ctx.fillStyle = '#8476bb'; ctx.fillRect(-100, -100, 200, 200);
    ctx.fillStyle = '#c8afeb';
    circle(ctx, 0, 0, 45); ctx.fill();
    ctx.strokeStyle = '#f1d6ab'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.ellipse(0, 0, 84, 22, -0.45, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#f8efd8';
    for (const [x, y] of [[-48, -62], [61, 62], [59, -64], [-68, 33]]) { circle(ctx, x, y, 3); ctx.fill(); }
  } else if (skin === '8ball') {
    ctx.fillStyle = '#42464e'; ctx.fillRect(-100, -100, 200, 200);
    circle(ctx, 0, 0, 57); ctx.fillStyle = '#fbf9ef'; ctx.fill();
    ctx.fillStyle = '#42464e'; ctx.font = '700 76px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('8', 0, 6);
  } else if (skin === 'sunset') {
    ctx.fillStyle = '#d492c6'; ctx.fillRect(-100, -100, 200, 200);
    circle(ctx, 0, -6, 49); ctx.fillStyle = '#f7d793'; ctx.fill();
    const hues = ['#e79bad', '#bd89b7', '#916aab', '#68548e'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = hues[i];
      ctx.beginPath(); ctx.moveTo(-100, 14 + i * 24);
      ctx.bezierCurveTo(-35, -20 + i * 24, 25, 55 + i * 18, 100, i * 28);
      ctx.lineTo(100, 100); ctx.lineTo(-100, 100); ctx.closePath(); ctx.fill();
    }
  } else if (skin === 'checker') {
    ctx.fillStyle = '#f4e9d5'; ctx.fillRect(-100, -100, 200, 200);
    ctx.fillStyle = '#a69ccc';
    for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) if ((x + y) % 2 === 0) ctx.fillRect(x * 34, y * 34, 34, 34);
  } else if (skin === 'galaxy') {
    ctx.fillStyle = '#1a0933'; ctx.fillRect(-100, -100, 200, 200);
    ctx.fillStyle = '#9b59b6';
    circle(ctx, -30, -30, 45); ctx.fill();
    ctx.fillStyle = '#3498db';
    circle(ctx, 35, 25, 50); ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (const [x, y] of [[-50, 40], [45, -45], [10, -70], [-20, 10], [60, 60]]) { circle(ctx, x, y, 3); ctx.fill(); }
  } else if (skin === 'fire') {
    ctx.fillStyle = '#c0392b'; ctx.fillRect(-100, -100, 200, 200);
    ctx.fillStyle = '#e74c3c'; circle(ctx, 0, 10, 70); ctx.fill();
    ctx.fillStyle = '#f39c12'; circle(ctx, 0, 25, 50); ctx.fill();
    ctx.fillStyle = '#f1c40f'; circle(ctx, 0, 40, 25); ctx.fill();
  } else if (skin === 'neon') {
    ctx.fillStyle = '#0f172a'; ctx.fillRect(-100, -100, 200, 200);
    ctx.strokeStyle = '#00cec9'; ctx.lineWidth = 10;
    circle(ctx, 0, 0, 70); ctx.stroke();
    ctx.strokeStyle = '#fd79a8'; ctx.lineWidth = 6;
    circle(ctx, 0, 0, 45); ctx.stroke();
    ctx.fillStyle = '#00cec9'; circle(ctx, 0, 0, 15); ctx.fill();
  } else if (skin === 'gold') {
    ctx.fillStyle = '#d4ac0d'; ctx.fillRect(-100, -100, 200, 200);
    ctx.fillStyle = '#f1c40f'; circle(ctx, 0, 0, 75); ctx.fill();
    ctx.fillStyle = '#fef5d1';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      circle(ctx, Math.cos(a) * 45, Math.sin(a) * 45, 8); ctx.fill();
    }
  } else if (skin === 'venom') {
    ctx.fillStyle = '#1e272e'; ctx.fillRect(-100, -100, 200, 200);
    ctx.fillStyle = '#10ac84';
    circle(ctx, -25, -25, 40); ctx.fill();
    circle(ctx, 30, 30, 45); ctx.fill();
    ctx.strokeStyle = '#00d2d3'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-60, -60); ctx.lineTo(60, 60); ctx.stroke();
  } else if (skin === 'dragon') {
    ctx.fillStyle = '#0f3460'; ctx.fillRect(-100, -100, 200, 200);
    ctx.fillStyle = '#16213e'; circle(ctx, 0, 0, 78); ctx.fill();
    ctx.fillStyle = '#00b4d8';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      circle(ctx, Math.cos(a) * 48, Math.sin(a) * 48, 14); ctx.fill();
    }
    ctx.fillStyle = '#e63946';
    circle(ctx, -22, -12, 9); ctx.fill();
    circle(ctx, 22, -12, 9); ctx.fill();
    ctx.fillStyle = '#ffffff';
    circle(ctx, -20, -14, 3.5); ctx.fill();
    circle(ctx, 20, -14, 3.5); ctx.fill();
  } else if (skin === 'phoenix') {
    ctx.fillStyle = '#800f2f'; ctx.fillRect(-100, -100, 200, 200);
    ctx.fillStyle = '#c9184a'; circle(ctx, 0, 0, 78); ctx.fill();
    ctx.fillStyle = '#ff758f'; circle(ctx, 0, 0, 52); ctx.fill();
    ctx.fillStyle = '#ffb703';
    circle(ctx, 0, -28, 22); ctx.fill();
    ctx.strokeStyle = '#fb8500'; ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(0, 10, 48, 0.4, Math.PI - 0.4); ctx.stroke();
  } else if (skin === 'portal') {
    ctx.fillStyle = '#03071e'; ctx.fillRect(-100, -100, 200, 200);
    ctx.strokeStyle = '#7209b7'; ctx.lineWidth = 14;
    circle(ctx, 0, 0, 72); ctx.stroke();
    ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 7;
    circle(ctx, 0, 0, 45); ctx.stroke();
    ctx.fillStyle = '#000000'; circle(ctx, 0, 0, 28); ctx.fill();
    ctx.fillStyle = '#f72585';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + time * 2;
      circle(ctx, Math.cos(a) * 58, Math.sin(a) * 58, 4); ctx.fill();
    }
  } else if (skin === 'cyber') {
    ctx.fillStyle = '#1a102f'; ctx.fillRect(-100, -100, 200, 200);
    ctx.strokeStyle = '#00f5d4'; ctx.lineWidth = 4;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * 32, -80); ctx.lineTo(i * 32, 80); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-80, i * 32); ctx.lineTo(80, i * 32); ctx.stroke();
    }
    ctx.fillStyle = '#f72585'; circle(ctx, 0, 0, 36); ctx.fill();
    ctx.fillStyle = '#ffffff'; circle(ctx, 0, 0, 14); ctx.fill();
  } else if (skin === 'sakura') {
    ctx.fillStyle = '#ffe5ec'; ctx.fillRect(-100, -100, 200, 200);
    ctx.fillStyle = '#ffb3c6';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      circle(ctx, Math.cos(a) * 38, Math.sin(a) * 38, 24); ctx.fill();
    }
    ctx.fillStyle = '#fb6f92'; circle(ctx, 0, 0, 20); ctx.fill();
    ctx.fillStyle = '#ffeaa7'; circle(ctx, 0, 0, 8); ctx.fill();
  }
  void time;
  ctx.restore();
}

export function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, name: string, time: number, skin: SkinId = 'classic', mass?: number, quality = true, player = false, pulse = 0) {
  const displayRadius = radius * (1 + Math.max(0, Math.min(1, pulse)) * 0.07);
  ctx.save();
  ctx.translate(x, y);
  if (player) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    circle(ctx, 0, 0, displayRadius + 7);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }
  cellPath(ctx, displayRadius, time, x * 0.1, quality);
  ctx.fillStyle = color;
  ctx.fill();
  if (skin !== 'classic') paintSkin(ctx, displayRadius - 1, skin, color, time);
  cellPath(ctx, displayRadius, time, x * 0.1, quality);
  ctx.strokeStyle = shade(skin === 'classic' ? color : skin === '8ball' ? '#42464e' : color, 0.88);
  ctx.lineWidth = Math.max(2, Math.min(5, displayRadius * 0.052));
  ctx.stroke();
  if (name) {
    const fontSize = Math.max(12, Math.min(displayRadius * 0.48, displayRadius * 1.6 / Math.max(2, name.length) * 1.45));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${fontSize}px "Nunito Sans", Arial, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.6, fontSize / 11);
    ctx.strokeStyle = 'rgba(0,0,0,.16)';
    ctx.strokeText(name, 0, mass ? -fontSize * 0.13 : 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, 0, mass ? -fontSize * 0.13 : 0);
    if (mass) {
      ctx.font = `600 ${Math.max(10, fontSize * 0.57)}px "Nunito Sans", Arial`;
      ctx.fillText(String(Math.round(mass)), 0, fontSize * 0.75);
    }
  } else if (mass) {
    ctx.fillStyle = 'white'; ctx.font = `600 ${Math.max(11, displayRadius * 0.25)}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(Math.round(mass)), 0, 0);
  }
  if (player) {
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    circle(ctx, 0, -displayRadius * 0.68, Math.max(2, displayRadius * 0.035)); ctx.fill();
  }
  ctx.restore();
}

interface VirusSpikeLUT {
  cos: Float32Array;
  sin: Float32Array;
  rDelta: Float32Array;
}
function createSpikeLUT(spikes: number): VirusSpikeLUT {
  const count = spikes * 2;
  const cos = new Float32Array(count);
  const sin = new Float32Array(count);
  const rDelta = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    cos[i] = Math.cos(angle);
    sin[i] = Math.sin(angle);
    rDelta[i] = i % 2 === 0 ? 3 : -4;
  }
  return { cos, sin, rDelta };
}
const NORMAL_VIRUS_LUT = createSpikeLUT(34);
const MOTHER_VIRUS_LUT = createSpikeLUT(44);

function drawVirus(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, time: number, mother = false, fed = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 0.013);
  ctx.beginPath();
  const lut = mother ? MOTHER_VIRUS_LUT : NORMAL_VIRUS_LUT;
  const count = lut.cos.length;
  const fedOffset = fed * 0.6;
  const cos = lut.cos;
  const sin = lut.sin;
  const rDelta = lut.rDelta;
  for (let i = 0; i < count; i++) {
    const r = radius + rDelta[i] + fedOffset;
    if (i === 0) ctx.moveTo(cos[i] * r, sin[i] * r);
    else ctx.lineTo(cos[i] * r, sin[i] * r);
  }
  ctx.closePath();
  ctx.fillStyle = mother ? '#e496b3' : '#9bcf78';
  ctx.strokeStyle = mother ? '#c67194' : '#76b958';
  ctx.lineWidth = 3;
  ctx.fill(); ctx.stroke();
  ctx.globalAlpha = 0.17;
  circle(ctx, -radius * 0.21, -radius * 0.16, radius * 0.6);
  ctx.fillStyle = 'white'; ctx.fill();
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, zoom: number, cameraX: number, cameraY: number, dark: boolean) {
  const size = 34 * zoom;
  if (size < 6) return;
  const offsetX = ((w / 2 - cameraX * zoom) % size + size) % size;
  const offsetY = ((h / 2 - cameraY * zoom) % size + size) % size;
  ctx.strokeStyle = dark ? '#292e35' : '#e9edea';
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  for (let x = offsetX; x < w; x += size) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
  for (let y = offsetY; y < h; y += size) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
  ctx.stroke();
}

const attractionCells: { x: number; y: number; r: number; color: string; name: string; skin?: SkinId }[] = [
  { x: 0.009, y: 0.32, r: 108, color: '#e885a0', name: 'nova' },
  { x: 0.264, y: 0.197, r: 43, color: '#eeba57', name: 'tiny' },
  { x: 0.247, y: 0.756, r: 88, color: '#a18add', name: 'moon' },
  { x: 0.765, y: 0.742, r: 92, color: '#78bce7', name: 'blob' },
  { x: 0.945, y: 0.529, r: 68, color: '#a0ce7b', name: 'leaf' },
  { x: 0.087, y: 0.893, r: 40, color: '#edba66', name: 'boba' },
  { x: 0.657, y: 0.176, r: 29, color: '#69c0b1', name: 'miso' },
  { x: 0.897, y: 1.036, r: 91, color: '#b296df', name: '' },
  { x: 0.165, y: 0.441, r: 22, color: '#83bddf', name: '' },
  { x: 0.601, y: 0.943, r: 26, color: '#ed93aa', name: 'hi' },
];

function drawAttract(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, prefs: Preferences, reducedMotion: boolean) {
  const scale = Math.max(0.56, Math.min(w / 1440, h / 900));
  const motionTime = reducedMotion ? 0 : time;
  for (let i = 0; i < 190; i++) {
    const x = ((Math.sin(i * 127.1 + 12) * 43758.5453) % 1 + 1) % 1 * w;
    const y = ((Math.sin(i * 311.7 + 7) * 45321.9123) % 1 + 1) % 1 * h;
    circle(ctx, x, y, (2.3 + (i % 4) * 0.57) * Math.max(0.8, scale));
    ctx.fillStyle = FOOD_COLORS[i % FOOD_COLORS.length];
    ctx.fill();
  }
  for (let i = 0; i < attractionCells.length; i++) {
    const cell = attractionCells[i];
    const dx = Math.sin(motionTime * 0.17 + i * 3) * 10 * scale;
    const dy = Math.sin(motionTime * 0.21 + i) * 8 * scale;
    drawCell(ctx, cell.x * w + dx, cell.y * h + dy, cell.r * scale, cell.color, prefs.names ? cell.name : '', motionTime, cell.skin, undefined, prefs.quality);
  }
  drawVirus(ctx, w * 0.11 + Math.sin(motionTime * 0.17) * 7, h * 0.647, 47 * scale, motionTime);
  drawVirus(ctx, w * 0.76, h * 0.342 + Math.sin(motionTime * 0.22) * 6, 28 * scale, motionTime + 10);
}

const FOOD_BATCHES: Food[][] = FOOD_COLORS.map(() => []);
const FOOD_COLOR_MAP: Record<string, number> = {};
FOOD_COLORS.forEach((color, idx) => { FOOD_COLOR_MAP[color] = idx; });
const RENDER_CELL_BUFFER: Cell[] = [];

export function renderArena(ctx: CanvasRenderingContext2D, engine: AgarEngine, w: number, h: number, preferences: Preferences, reducedMotion = false) {
  ctx.fillStyle = preferences.dark ? '#20252c' : '#f9fbf9';
  ctx.fillRect(0, 0, w, h);
  const { x, y, zoom } = engine.camera;
  const inLobby = engine.phase === 'lobby';
  if (preferences.grid) drawGrid(ctx, w, h, inLobby ? 1 : zoom, inLobby ? 0 : x, inLobby ? 0 : y, preferences.dark);
  if (inLobby) { drawAttract(ctx, w, h, engine.visualTime, preferences, reducedMotion); return; }
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-x, -y);
  const halfW = w / zoom / 2;
  const halfH = h / zoom / 2;
  const minX = x - halfW;
  const maxX = x + halfW;
  const minY = y - halfH;
  const maxY = y + halfH;
  const visible = (px: number, py: number, radius = 10) => px + radius > minX && px - radius < maxX && py + radius > minY && py - radius < maxY;
  ctx.strokeStyle = preferences.dark ? '#535b67' : '#c9d0ca';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);

  if (engine.mode === 'royale' && engine.royaleRadius) {
    const rx = WORLD_SIZE / 2;
    const ry = WORLD_SIZE / 2;
    const rrad = engine.royaleRadius;
    ctx.save();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 6;
    ctx.setLineDash([16, 12]);
    circle(ctx, rx, ry, rrad);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)';
    ctx.lineWidth = 20;
    circle(ctx, rx, ry, rrad);
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-500, -500, WORLD_SIZE + 1000, WORLD_SIZE + 1000);
    ctx.arc(rx, ry, rrad, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(168, 85, 247, 0.1)';
    ctx.fill();
    ctx.restore();
  }

  for (let i = 0; i < FOOD_BATCHES.length; i++) FOOD_BATCHES[i].length = 0;
  for (const food of engine.food) {
    if (!visible(food.x, food.y, food.radius + 2)) continue;
    if (food.kind === 'gold') {
      const glow = 1 + Math.sin(engine.visualTime * 5 + food.id) * 0.18;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 215, 0, 0.35)';
      circle(ctx, food.x, food.y, food.radius * 1.8 * glow);
      ctx.fill();
      ctx.fillStyle = '#ffd700';
      circle(ctx, food.x, food.y, food.radius);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      circle(ctx, food.x, food.y, food.radius * 0.35);
      ctx.fill();
      ctx.restore();
    } else if (food.kind === 'speed') {
      const pulse = 1 + Math.sin(engine.visualTime * 6 + food.id) * 0.15;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 206, 201, 0.35)';
      circle(ctx, food.x, food.y, food.radius * 1.7 * pulse);
      ctx.fill();
      ctx.fillStyle = '#00cec9';
      circle(ctx, food.x, food.y, food.radius);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      circle(ctx, food.x, food.y, food.radius * 0.35);
      ctx.fill();
      ctx.restore();
    } else {
      const cIdx = FOOD_COLOR_MAP[food.color] ?? 0;
      FOOD_BATCHES[cIdx].push(food);
    }
  }

  // Batched draw calls for standard food dots
  for (let c = 0; c < FOOD_BATCHES.length; c++) {
    const batch = FOOD_BATCHES[c];
    if (batch.length === 0) continue;
    ctx.fillStyle = FOOD_COLORS[c];
    ctx.beginPath();
    for (let i = 0; i < batch.length; i++) {
      const f = batch[i];
      const shimmer = preferences.quality ? 1 + Math.sin(engine.visualTime * 3 + f.id * 1.7) * 0.08 : 1;
      const r = f.radius * shimmer;
      ctx.moveTo(f.x + r, f.y);
      ctx.arc(f.x, f.y, r, 0, TAU);
    }
    ctx.fill();
  }

  for (const mass of engine.ejected) {
    if (!visible(mass.x, mass.y) || mass.mass <= 0) continue;
    circle(ctx, mass.x, mass.y, mass.radius);
    ctx.fillStyle = mass.color; ctx.fill();
    ctx.strokeStyle = shade(mass.color, 0.88); ctx.lineWidth = 2; ctx.stroke();
  }
  for (const virus of engine.viruses) if (visible(virus.x, virus.y, virus.radius)) drawVirus(ctx, virus.x, virus.y, virus.radius, engine.visualTime, virus.mother, virus.fed);
  RENDER_CELL_BUFFER.length = 0;
  for (let o = 0; o < engine.owners.length; o++) {
    const oCells = engine.owners[o].cells;
    for (let c = 0; c < oCells.length; c++) {
      const cell = oCells[c];
      if (visible(cell.x, cell.y, cell.radius)) {
        RENDER_CELL_BUFFER.push(cell);
      }
    }
  }
  RENDER_CELL_BUFFER.sort((a, b) => a.radius - b.radius);
  for (let i = 0; i < RENDER_CELL_BUFFER.length; i++) {
    const cell = RENDER_CELL_BUFFER[i];
    const owner = engine.owners[cell.owner];
    const protectedCell = owner.protectedUntil > engine.time;
    if (protectedCell) ctx.globalAlpha = 0.8;
    drawCell(ctx, cell.x, cell.y, cell.radius, owner.color, preferences.names ? owner.name : '', engine.visualTime, owner.skin, preferences.mass ? cell.mass : undefined, preferences.quality, owner.id === 0, cell.pulse);
    ctx.globalAlpha = 1;
    if (owner.id === 0 && protectedCell) {
      ctx.strokeStyle = 'rgba(238,123,88,.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      circle(ctx, cell.x, cell.y, cell.radius + 9); ctx.stroke(); ctx.setLineDash([]);
    }
    if (owner.id === 0 && engine.speedBoostUntil > engine.time) {
      ctx.save();
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 3.5;
      ctx.globalAlpha = 0.65;
      circle(ctx, cell.x, cell.y, cell.radius + 6);
      ctx.stroke();
      ctx.restore();
    }
    if (owner.id === 999) {
      ctx.save();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 6;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(engine.visualTime * 5);
      circle(ctx, cell.x, cell.y, cell.radius + 14);
      ctx.stroke();
      ctx.restore();
    }
  }
  // Meteor alert zone on arena
  if (engine.meteorAlert && visible(engine.meteorAlert.x, engine.meteorAlert.y, engine.meteorAlert.radius + 50)) {
    const ma = engine.meteorAlert;
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    circle(ctx, ma.x, ma.y, ma.radius * (0.85 + 0.15 * Math.sin(engine.visualTime * 6)));
    ctx.stroke();
    ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
    ctx.fill();
    ctx.font = '700 18px "Nunito Sans", Arial, sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText(`☄️ SAO BĂNG: ${ma.timeRemaining.toFixed(1)}s`, ma.x, ma.y);
    ctx.restore();
  }
  // Floating active emotes
  for (const emote of engine.activeEmotes) {
    if (!visible(emote.x, emote.y, 60)) continue;
    const age = engine.time - emote.born;
    const progress = Math.min(1, age / emote.duration);
    const floatY = emote.y - age * 14;
    const scale = age < 0.2 ? age / 0.2 * 1.3 : (age < 0.35 ? 1.3 - (age - 0.2) * 2 : (progress > 0.8 ? (1 - progress) / 0.2 : 1));
    ctx.save();
    ctx.translate(emote.x, floatY);
    ctx.scale(Math.max(0.1, scale), Math.max(0.1, scale));
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '24px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emote.emoji, 0, 1);
    ctx.restore();
  }
  if (preferences.quality) {
    for (const particle of engine.particles) {
      if (!visible(particle.x, particle.y, particle.radius)) continue;
      ctx.globalAlpha = Math.max(0, particle.life / 0.45);
      ctx.fillStyle = particle.color;
      circle(ctx, particle.x, particle.y, particle.radius); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  for (const floater of engine.floaters) {
    if (!visible(floater.x, floater.y, 20)) continue;
    const progress = Math.max(0, floater.life / floater.ttl);
    ctx.globalAlpha = Math.min(1, progress * 1.6);
    ctx.font = '700 15px "Nunito Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.strokeText(floater.text, floater.x, floater.y);
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, floater.x, floater.y);
  }
  if (engine.aiDebug) drawAiDebug(ctx, engine);
  ctx.globalAlpha = 1;
  ctx.restore();
  if (engine.phase === 'playing') drawBorderWarning(ctx, engine, w, h);
}

const STRATEGY_COLOR: Record<string, string> = {
  flee: '#e85d4c',
  bait: '#e6b15c',
  hunt: '#e38b3a',
  stalk: '#d4a017',
  farm: '#6aaa62',
  explore: '#6aa4d8',
  recover: '#b08ad4',
  reposition: '#c9845a',
};

function drawAiDebug(ctx: CanvasRenderingContext2D, engine: AgarEngine) {
  const marks = engine.aiDebugMarks();
  ctx.save();
  ctx.lineWidth = 1.25;
  ctx.font = '600 11px "Nunito Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (const mark of marks) {
    const color = STRATEGY_COLOR[mark.strategy] ?? '#888';
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, Math.min(mark.perception, 420), 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(mark.x, mark.y);
    ctx.lineTo(mark.tx, mark.ty);
    ctx.stroke();
    if (mark.targetScore > 0.2) {
      ctx.globalAlpha = 0.62;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#d38e46';
      ctx.beginPath();
      ctx.moveTo(mark.x, mark.y);
      ctx.lineTo(mark.interceptX, mark.interceptY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#d38e46';
      circle(ctx, mark.interceptX, mark.interceptY, 7 + mark.huntProbability * 9);
      ctx.stroke();
    }
    if (mark.threat > 0.3) {
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#e85d4c';
      ctx.beginPath();
      ctx.moveTo(mark.x, mark.y);
      ctx.lineTo(mark.escapeX, mark.escapeY);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = color;
    const tti = Number.isFinite(mark.timeToIntercept) ? ` tti=${mark.timeToIntercept.toFixed(1)}` : '';
    ctx.fillText(`${mark.note} ${mark.situation} q=${Math.round(mark.confidence * 100)}%${tti}`, mark.x, mark.y - 14);
  }
  ctx.restore();
}

function drawBorderWarning(ctx: CanvasRenderingContext2D, engine: AgarEngine, w: number, h: number) {
  if (!engine.player.cells.length) return;
  let x = 0;
  let y = 0;
  let mass = 0;
  for (const cell of engine.player.cells) {
    x += cell.x * cell.mass;
    y += cell.y * cell.mass;
    mass += cell.mass;
  }
  if (mass <= 0) return;
  x /= mass;
  y /= mass;
  const margin = 420;
  const fade = (dist: number) => dist >= margin ? 0 : (1 - dist / margin) * 0.22;
  const paint = (alpha: number, grad: CanvasGradient) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };
  if (x < margin) {
    const grad = ctx.createLinearGradient(0, 0, Math.min(170, w * 0.2), 0);
    grad.addColorStop(0, 'rgba(196, 64, 52, 1)');
    grad.addColorStop(1, 'rgba(196, 64, 52, 0)');
    paint(fade(x), grad);
  }
  if (WORLD_SIZE - x < margin) {
    const grad = ctx.createLinearGradient(w, 0, w - Math.min(170, w * 0.2), 0);
    grad.addColorStop(0, 'rgba(196, 64, 52, 1)');
    grad.addColorStop(1, 'rgba(196, 64, 52, 0)');
    paint(fade(WORLD_SIZE - x), grad);
  }
  if (y < margin) {
    const grad = ctx.createLinearGradient(0, 0, 0, Math.min(140, h * 0.18));
    grad.addColorStop(0, 'rgba(196, 64, 52, 1)');
    grad.addColorStop(1, 'rgba(196, 64, 52, 0)');
    paint(fade(y), grad);
  }
  if (WORLD_SIZE - y < margin) {
    const grad = ctx.createLinearGradient(0, h, 0, h - Math.min(140, h * 0.18));
    grad.addColorStop(0, 'rgba(196, 64, 52, 1)');
    grad.addColorStop(1, 'rgba(196, 64, 52, 0)');
    paint(fade(WORLD_SIZE - y), grad);
  }
}

export function renderMinimap(ctx: CanvasRenderingContext2D, engine: AgarEngine, size: number, dark: boolean) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = dark ? 'rgba(35,41,48,.85)' : 'rgba(255,255,255,.84)';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = dark ? '#3a414a' : '#ebeeeb'; ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(i / 5 * size, 0); ctx.lineTo(i / 5 * size, size); ctx.moveTo(0, i / 5 * size); ctx.lineTo(size, i / 5 * size); ctx.stroke();
  }
  ctx.fillStyle = '#7dae62';
  ctx.globalAlpha = 0.85;
  for (const virus of engine.viruses) {
    circle(ctx, virus.x / WORLD_SIZE * size, virus.y / WORLD_SIZE * size, virus.mother ? 2.5 : 1.7);
    ctx.fill();
  }
  for (const owner of engine.owners) {
    for (const cell of owner.cells) {
      const x = cell.x / WORLD_SIZE * size;
      const y = cell.y / WORLD_SIZE * size;
      ctx.fillStyle = owner.id === 0 ? '#ed855c' : owner.color;
      ctx.globalAlpha = owner.id === 0 ? 1 : 0.56;
      circle(ctx, x, y, owner.id === 0 ? 3 : Math.max(1.5, cell.radius / WORLD_SIZE * size)); ctx.fill();
      if (owner.id === 0) { ctx.globalAlpha = 0.18; circle(ctx, x, y, 9); ctx.fill(); }
    }
  }
  ctx.globalAlpha = 1;
  const focusX = engine.camera.x / WORLD_SIZE * size;
  const focusY = engine.camera.y / WORLD_SIZE * size;
  const viewW = Math.min(size, engine.width / engine.camera.zoom / WORLD_SIZE * size);
  const viewH = Math.min(size, engine.height / engine.camera.zoom / WORLD_SIZE * size);
  ctx.strokeStyle = dark ? '#a3adb7' : '#bac3b9'; ctx.lineWidth = 1;
  ctx.strokeRect(focusX - viewW / 2, focusY - viewH / 2, viewW, viewH);
  if (engine.mode === 'royale' && engine.royaleRadius) {
    const rx = size / 2;
    const ry = size / 2;
    const rrad = (engine.royaleRadius / WORLD_SIZE) * size;
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1.5;
    circle(ctx, rx, ry, rrad);
    ctx.stroke();
  }
  if (engine.mode === 'boss') {
    const bx = size / 2;
    const by = size / 2;
    ctx.fillStyle = '#9333ea';
    circle(ctx, bx, by, 5);
    ctx.fill();
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.5;
    circle(ctx, bx, by, 8);
    ctx.stroke();
  }
  if (engine.meteorAlert) {
    const mx = (engine.meteorAlert.x / WORLD_SIZE) * size;
    const my = (engine.meteorAlert.y / WORLD_SIZE) * size;
    ctx.fillStyle = '#f59e0b';
    circle(ctx, mx, my, 4 + Math.sin(engine.visualTime * 8) * 1.5);
    ctx.fill();
  }
  if (engine.phase === 'lobby') {
    ctx.fillStyle = CELL_COLORS[0]; circle(ctx, size / 2, size / 2, 2.5); ctx.fill();
  }
}