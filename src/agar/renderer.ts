import type { AgarEngine } from './engine';
import { CELL_COLORS, FOOD_COLORS, WORLD_SIZE, type Cell, type Preferences, type SkinId } from './types';

const TAU = Math.PI * 2;
const shade = (hex: string, factor: number) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${Math.round((value >> 16) * factor)},${Math.round(((value >> 8) & 255) * factor)},${Math.round((value & 255) * factor)})`;
};

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, radius), 0, TAU);
}

function cellPath(ctx: CanvasRenderingContext2D, radius: number, time: number, seed: number, organic: boolean) {
  ctx.beginPath();
  if (!organic) { ctx.arc(0, 0, radius, 0, TAU); return; }
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const angle = i / steps * TAU;
    const offset = Math.sin(angle * 5 + time * 0.6 + seed) * 0.5 + Math.sin(angle * 3 - time * 0.8 + seed) * 0.6;
    const r = radius + offset * Math.min(2.1, radius / 42);
    if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
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

function drawVirus(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, time: number, mother = false, fed = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  const spikes = mother ? 44 : 34;
  for (let i = 0; i < spikes * 2; i++) {
    const angle = i / (spikes * 2) * TAU + time * 0.013;
    const r = radius + (i % 2 === 0 ? 3 : -4) + fed * 0.6;
    if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
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
  const visible = (px: number, py: number, radius = 10) => px + radius > x - halfW && px - radius < x + halfW && py + radius > y - halfH && py - radius < y + halfH;
  ctx.strokeStyle = preferences.dark ? '#535b67' : '#c9d0ca';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
  for (const food of engine.food) {
    if (!visible(food.x, food.y)) continue;
    const shimmer = preferences.quality ? 1 + Math.sin(engine.visualTime * 3 + food.id * 1.7) * 0.08 : 1;
    circle(ctx, food.x, food.y, food.radius * shimmer);
    ctx.fillStyle = food.color;
    ctx.fill();
  }
  for (const mass of engine.ejected) {
    if (!visible(mass.x, mass.y) || mass.mass <= 0) continue;
    circle(ctx, mass.x, mass.y, mass.radius);
    ctx.fillStyle = mass.color; ctx.fill();
    ctx.strokeStyle = shade(mass.color, 0.88); ctx.lineWidth = 2; ctx.stroke();
  }
  for (const virus of engine.viruses) if (visible(virus.x, virus.y, virus.radius)) drawVirus(ctx, virus.x, virus.y, virus.radius, engine.visualTime, virus.mother, virus.fed);
  const allCells: Cell[] = engine.owners.flatMap(owner => owner.cells).filter(cell => visible(cell.x, cell.y, cell.radius)).sort((a, b) => a.radius - b.radius);
  for (const cell of allCells) {
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
  }
  if (preferences.quality) {
    for (const particle of engine.particles) {
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
  if (engine.phase === 'lobby') {
    ctx.fillStyle = CELL_COLORS[0]; circle(ctx, size / 2, size / 2, 2.5); ctx.fill();
  }
}