import { arenaSound } from './sound';
import {
  BOT_COUNT, CELL_COLORS, FOOD_COLORS, TEAM_COLORS, WORLD_SIZE, massRadius,
  type ArenaSnapshot, type Cell, type EjectedMass, type Food, type GameMode,
  type GamePhase, type Organism, type Particle, type RunStats, type SkinId, type Virus,
} from './types';

const FOOD_COUNT = 2900;
const GRID_SIZE = 140;
const NAMES = ['nova', 'moon', 'blob', 'Orbit', 'tiny', 'jelly', 'pixel', 'miso', 'cosmo', 'Boba', 'just a cell', 'Noodle', 'pluto', 'chill', 'big little', 'Mochi', 'nebula', 'peach', 'no name', 'echo', 'bloop', 'Sushi', 'coco', 'leaf', 'bubble', 'kiwi', 'hello', 'mango', 'noodle soup', 'squish', 'pudding', 'stardust', 'not food', 'panda', 'luna', 'slowly', 'taro', 'moss', 'little bean', 'daisy', 'marble', 'Cloud', 'mint', 'bonbon', 'jupiter', 'soda', 'sprout', 'wobble'];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

// Food stays indexed as it respawns, so bots and cells only inspect nearby buckets.
class FoodIndex {
  private buckets = new Map<number, Set<Food>>();
  private key(x: number, y: number) { return Math.floor(x / GRID_SIZE) + Math.floor(y / GRID_SIZE) * 100; }
  add(food: Food) {
    const key = this.key(food.x, food.y);
    if (!this.buckets.has(key)) this.buckets.set(key, new Set());
    this.buckets.get(key)!.add(food);
  }
  remove(food: Food) { this.buckets.get(this.key(food.x, food.y))?.delete(food); }
  *near(x: number, y: number, radius: number): Generator<Food> {
    const left = Math.floor((x - radius) / GRID_SIZE);
    const right = Math.floor((x + radius) / GRID_SIZE);
    const top = Math.floor((y - radius) / GRID_SIZE);
    const bottom = Math.floor((y + radius) / GRID_SIZE);
    for (let gy = top; gy <= bottom; gy++) {
      for (let gx = left; gx <= right; gx++) {
        const bucket = this.buckets.get(gx + gy * 100);
        if (bucket) yield* bucket;
      }
    }
  }
}

export class AgarEngine {
  mode: GameMode = 'ffa';
  phase: GamePhase = 'lobby';
  paused = false;
  time = 0;
  visualTime = 0;
  owners: Organism[] = [];
  food: Food[] = [];
  ejected: EjectedMass[] = [];
  viruses: Virus[] = [];
  particles: Particle[] = [];
  camera = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, zoom: 1 };
  pointer = { x: 0, y: 0 };
  keys = new Set<string>();
  width = 1440;
  height = 900;
  zoomOffset = 1;
  spectateId = 1;
  stats: RunStats = this.emptyStats();
  private nextId = 1;
  private seed = 42791;
  private index = new FoodIndex();
  private ejectAt = 0;
  private rankAt = 0;

  constructor() { this.populate(); }

  private emptyStats(): RunStats { return { peak: 40, food: 0, cells: 0, seconds: 0, bestRank: BOT_COUNT + 1, eatenBy: '' }; }
  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  private coordinate(padding = 80) { return padding + this.random() * (WORLD_SIZE - padding * 2); }

  get player() { return this.owners[0]; }
  get playerMass() { return this.player.cells.reduce((sum, cell) => sum + cell.mass, 0); }

  private makeCell(owner: number, x: number, y: number, mass: number): Cell {
    return { id: this.nextId++, owner, x, y, mass, radius: massRadius(mass), vx: 0, vy: 0, born: this.time, mergeAt: this.time, alive: true };
  }

  private populate() {
    this.owners = [{ id: 0, name: 'You', color: CELL_COLORS[0], skin: 'classic', team: 0, cells: [], targetX: 2400, targetY: 2400, nextDecision: 0, splitAt: 0, respawnAt: 0, protectedUntil: 0 }];
    for (let i = 0; i < BOT_COUNT; i++) {
      const mass = i < 10 ? 1540 - i * 115 : 25 + Math.pow(this.random(), 1.7) * 440;
      let x = this.coordinate(240);
      const y = this.coordinate(240);
      if (Math.hypot(x - 2400, y - 2400) < 650 && mass > 100) x = 300 + i * 16;
      const skin: SkinId = i === 6 ? 'earth' : i === 16 ? '8ball' : i === 22 ? 'melon' : 'classic';
      this.owners.push({ id: i + 1, name: NAMES[i], color: CELL_COLORS[i % CELL_COLORS.length], skin, team: i % 3,
        cells: [this.makeCell(i + 1, x, y, mass)], targetX: x, targetY: y, nextDecision: 0,
        splitAt: 0, respawnAt: 0, protectedUntil: 0 });
    }
    this.food = [];
    this.index = new FoodIndex();
    for (let i = 0; i < FOOD_COUNT; i++) this.addFood();
    this.viruses = [];
    for (let i = 0; i < 24; i++) {
      let x = this.coordinate(180);
      const y = this.coordinate(180);
      if (Math.hypot(x - 2400, y - 2400) < 240) x += 400;
      this.viruses.push({ id: this.nextId++, x, y, radius: 58, vx: 0, vy: 0, fed: 0, mother: false, lastEmission: 0 });
    }
  }

  private addFood(x?: number, y?: number) {
    const food: Food = { id: this.nextId++, x: x ?? this.coordinate(12), y: y ?? this.coordinate(12),
      color: FOOD_COLORS[Math.floor(this.random() * FOOD_COLORS.length)], mass: 1.2 + this.random() * 0.8, radius: 3.2 + this.random() * 2.1 };
    this.food.push(food);
    this.index.add(food);
    return food;
  }

  private resetFood(food: Food, x?: number, y?: number) {
    this.index.remove(food);
    food.x = clamp(x ?? this.coordinate(12), 12, WORLD_SIZE - 12);
    food.y = clamp(y ?? this.coordinate(12), 12, WORLD_SIZE - 12);
    this.index.add(food);
  }

  private configureMode() {
    if (this.mode === 'teams') {
      this.owners.forEach(owner => { owner.color = TEAM_COLORS[owner.team]; owner.skin = 'classic'; });
    }
    if (this.mode === 'experimental') {
      for (let i = 0; i < 5; i++) {
        this.viruses[i].mother = true;
        this.viruses[i].radius = 105;
      }
    }
  }

  start(name: string, mode: GameMode, skin: SkinId, color: string) {
    this.mode = mode;
    this.time = 0;
    this.populate();
    this.phase = 'playing';
    this.paused = false;
    this.keys.clear();
    this.pointer = { x: 0, y: 0 };
    this.stats = this.emptyStats();
    this.ejected = [];
    this.particles = [];
    this.ejectAt = 0;
    this.rankAt = 0;
    this.zoomOffset = 1;
    this.player.name = name.trim().slice(0, 18) || 'Vô danh';
    this.player.skin = skin;
    this.player.color = color;
    this.player.cells = [this.makeCell(0, WORLD_SIZE / 2, WORLD_SIZE / 2, 40)];
    this.player.protectedUntil = 5;
    this.camera = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, zoom: 1.15 };
    this.configureMode();
    // The first few seconds teach movement without placing a giant on the spawn point.
    for (let i = 0; i < 45; i++) {
      const angle = this.random() * Math.PI * 2;
      const radius = 50 + this.random() * 400;
      this.resetFood(this.food[i], 2400 + Math.cos(angle) * radius, 2400 + Math.sin(angle) * radius);
    }
    arenaSound.play('start');
  }

  spectate(mode: GameMode = this.mode) {
    this.mode = mode;
    this.time = 0;
    this.populate();
    this.configureMode();
    this.ejected = [];
    this.particles = [];
    this.keys.clear();
    this.zoomOffset = 1;
    this.phase = 'spectating';
    this.paused = false;
    this.player.cells = [];
    this.spectateId = this.snapshot().leaders[0]?.id || 1;
  }

  spectateNext(direction = 1) {
    const active = this.owners.filter(owner => owner.id !== 0 && owner.cells.length);
    if (!active.length) return;
    const index = active.findIndex(owner => owner.id === this.spectateId);
    this.spectateId = active[(index + direction + active.length) % active.length].id;
  }

  lobby() {
    this.phase = 'lobby';
    this.paused = false;
    this.keys.clear();
    this.player.cells = [];
    this.camera = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, zoom: 1 };
  }

  update(dt: number) {
    this.visualTime += dt;
    if (this.paused || this.phase === 'ended') return;
    this.time += dt;
    if (this.phase === 'lobby') return;
    if (this.phase === 'playing') this.stats.seconds += dt;
    const cells = this.owners.flatMap(owner => owner.cells).filter(cell => cell.alive);
    for (const owner of this.owners) {
      if (owner.id !== 0 && !owner.cells.length && this.time >= owner.respawnAt) {
        const x = this.coordinate(160);
        const y = this.coordinate(160);
        owner.cells = [this.makeCell(owner.id, x, y, 28 + this.random() * 95)];
        owner.protectedUntil = this.time + 2;
      }
      if (!owner.cells.length) continue;
      if (owner.id === 0) this.updatePlayerTarget();
      else if (this.time >= owner.nextDecision) this.decide(owner, cells);
      this.moveOwner(owner, dt);
      this.recombine(owner, dt);
    }
    this.updateEjected(dt);
    this.consumeFood();
    this.consumeCells();
    this.updateViruses(dt);
    this.updateParticles(dt);
    if (this.phase === 'playing') {
      if (this.keys.has('w') && this.time >= this.ejectAt) this.eject();
      this.stats.peak = Math.max(this.stats.peak, Math.round(this.playerMass));
      if (!this.player.cells.length) {
        this.phase = 'ended';
        arenaSound.play('end');
      }
      if (this.time > this.rankAt && this.player.cells.length > 0) {
        const snapshot = this.snapshot();
        this.stats.bestRank = Math.min(this.stats.bestRank, snapshot.rank);
        this.rankAt = this.time + 0.8;
      }
    }
    this.updateCamera(dt);
  }

  private updatePlayerTarget() {
    let x = this.pointer.x;
    let y = this.pointer.y;
    const horizontal = Number(this.keys.has('arrowright') || this.keys.has('d')) - Number(this.keys.has('arrowleft') || this.keys.has('a'));
    const vertical = Number(this.keys.has('arrowdown') || this.keys.has('s')) - Number(this.keys.has('arrowup'));
    if (horizontal || vertical) { x = horizontal * 240; y = vertical * 240; }
    this.player.targetX = this.camera.x + x / this.camera.zoom;
    this.player.targetY = this.camera.y + y / this.camera.zoom;
  }

  private decide(owner: Organism, cells: Cell[]) {
    owner.nextDecision = this.time + 0.22 + this.random() * 0.18;
    const main = owner.cells.reduce((a, b) => a.mass > b.mass ? a : b);
    let fleeX = 0;
    let fleeY = 0;
    let danger = false;
    let prey: Cell | null = null;
    let preyValue = 0;
    for (const other of cells) {
      if (!other.alive || other.owner === owner.id) continue;
      const otherOwner = this.owners[other.owner];
      if (this.mode === 'teams' && otherOwner.team === owner.team) continue;
      const dist = distance(main, other);
      if (dist > 750) continue;
      if (other.mass > main.mass * 1.17 && dist < other.radius + main.radius + 290) {
        const weight = (other.radius + 180) / Math.max(20, dist - other.radius);
        fleeX += (main.x - other.x) / Math.max(1, dist) * weight;
        fleeY += (main.y - other.y) / Math.max(1, dist) * weight;
        danger = true;
      } else if (main.mass > other.mass * 1.25 && otherOwner.protectedUntil < this.time) {
        const value = other.mass / Math.max(80, dist);
        if (value > preyValue) { prey = other; preyValue = value; }
      }
    }
    for (const virus of this.viruses) {
      if (main.mass < (virus.mother ? 480 : 140)) continue;
      const dist = distance(main, virus);
      if (dist < main.radius + virus.radius + 65) {
        fleeX += (main.x - virus.x) / Math.max(1, dist) * 1.6;
        fleeY += (main.y - virus.y) / Math.max(1, dist) * 1.6;
        danger = true;
      }
    }
    if (danger) {
      fleeX += (WORLD_SIZE / 2 - main.x) / WORLD_SIZE * (main.x < 200 || main.x > WORLD_SIZE - 200 ? 2 : 0.08);
      fleeY += (WORLD_SIZE / 2 - main.y) / WORLD_SIZE * (main.y < 200 || main.y > WORLD_SIZE - 200 ? 2 : 0.08);
      owner.targetX = clamp(main.x + fleeX * 400, 60, WORLD_SIZE - 60);
      owner.targetY = clamp(main.y + fleeY * 400, 60, WORLD_SIZE - 60);
    } else if (prey) {
      owner.targetX = prey.x;
      owner.targetY = prey.y;
      if (owner.cells.length < 3 && main.mass > prey.mass * 2.7 && distance(main, prey) < main.radius + 170 && this.time > owner.splitAt && this.random() < 0.07) {
        this.splitOwner(owner, Math.atan2(prey.y - main.y, prey.x - main.x));
      }
    } else {
      let nearest: Food | null = null;
      let dist = 500;
      for (const food of this.index.near(main.x, main.y, 420)) {
        const d = distance(main, food);
        if (d < dist && d > 2) { nearest = food; dist = d; }
      }
      if (nearest) { owner.targetX = nearest.x; owner.targetY = nearest.y; }
      else if (distance(main, { x: owner.targetX, y: owner.targetY }) < 100) {
        owner.targetX = this.coordinate(200);
        owner.targetY = this.coordinate(200);
      }
    }
  }

  private moveOwner(owner: Organism, dt: number) {
    for (const cell of owner.cells) {
      if (!cell.alive) continue;
      const dx = owner.targetX - cell.x;
      const dy = owner.targetY - cell.y;
      const length = Math.hypot(dx, dy);
      const speed = 385 * Math.pow(Math.max(20, cell.mass), -0.14);
      const slow = Math.min(1, length / Math.max(25, cell.radius * 0.65));
      if (length > 1) {
        cell.x += dx / length * speed * slow * dt;
        cell.y += dy / length * speed * slow * dt;
      }
      cell.x += cell.vx * dt;
      cell.y += cell.vy * dt;
      cell.vx *= Math.exp(-3.4 * dt);
      cell.vy *= Math.exp(-3.4 * dt);
      cell.radius += (massRadius(cell.mass) - cell.radius) * Math.min(1, dt * 9);
      cell.x = clamp(cell.x, cell.radius, WORLD_SIZE - cell.radius);
      cell.y = clamp(cell.y, cell.radius, WORLD_SIZE - cell.radius);
      if (cell.mass > 180) cell.mass -= cell.mass * 0.0024 * dt;
    }
  }

  private recombine(owner: Organism, dt: number) {
    for (let i = 0; i < owner.cells.length; i++) {
      const a = owner.cells[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < owner.cells.length; j++) {
        const b = owner.cells[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        if (this.time >= a.mergeAt && this.time >= b.mergeAt) {
          if (dist < Math.max(a.radius, b.radius) * 0.8) {
            const total = a.mass + b.mass;
            a.x = (a.x * a.mass + b.x * b.mass) / total;
            a.y = (a.y * a.mass + b.y * b.mass) / total;
            a.mass = total;
            b.alive = false;
          }
        } else if (this.time - Math.max(a.born, b.born) > 0.6 && dist < a.radius + b.radius) {
          const force = (a.radius + b.radius - dist) * Math.min(0.5, dt * 7);
          const portion = b.mass / (a.mass + b.mass);
          a.x -= dx / dist * force * portion;
          a.y -= dy / dist * force * portion;
          b.x += dx / dist * force * (1 - portion);
          b.y += dy / dist * force * (1 - portion);
        }
      }
    }
    owner.cells = owner.cells.filter(cell => cell.alive);
  }

  split() {
    if (this.phase !== 'playing' || this.paused) return false;
    const angle = Math.atan2(this.pointer.y, this.pointer.x);
    const result = this.splitOwner(this.player, angle);
    if (result) arenaSound.play('split');
    return result;
  }

  private splitOwner(owner: Organism, angle: number) {
    const original = [...owner.cells].sort((a, b) => b.mass - a.mass);
    let split = false;
    for (const cell of original) {
      if (owner.cells.length >= 16) break;
      if (cell.mass < 40) continue;
      cell.mass /= 2;
      const radius = massRadius(cell.mass);
      const newCell = this.makeCell(owner.id, cell.x + Math.cos(angle) * radius, cell.y + Math.sin(angle) * radius, cell.mass);
      newCell.radius = radius * 0.7;
      newCell.vx = Math.cos(angle) * 760;
      newCell.vy = Math.sin(angle) * 760;
      cell.mergeAt = newCell.mergeAt = this.time + 14 + cell.mass * 0.014;
      owner.cells.push(newCell);
      split = true;
    }
    owner.splitAt = this.time + 12;
    return split;
  }

  eject() {
    if (this.phase !== 'playing' || this.paused || this.time < this.ejectAt) return false;
    let didEject = false;
    for (const cell of this.player.cells) {
      if (cell.mass < 36) continue;
      const angle = Math.atan2(this.player.targetY - cell.y, this.player.targetX - cell.x);
      const radius = massRadius(cell.mass);
      this.ejected.push({ id: this.nextId++, x: cell.x + Math.cos(angle) * (radius + 14), y: cell.y + Math.sin(angle) * (radius + 14),
        vx: Math.cos(angle) * 530, vy: Math.sin(angle) * 530, color: this.player.color,
        mass: 10, radius: 9, born: this.time, owner: 0 });
      cell.mass -= 12;
      didEject = true;
    }
    this.ejectAt = this.time + 0.16;
    if (didEject) arenaSound.play('eject');
    return didEject;
  }

  private updateEjected(dt: number) {
    for (const mass of this.ejected) {
      mass.x = clamp(mass.x + mass.vx * dt, 10, WORLD_SIZE - 10);
      mass.y = clamp(mass.y + mass.vy * dt, 10, WORLD_SIZE - 10);
      mass.vx *= Math.exp(-3.5 * dt);
      mass.vy *= Math.exp(-3.5 * dt);
    }
    this.ejected = this.ejected.filter(mass => this.time - mass.born < 100 && mass.mass > 0);
  }

  private consumeFood() {
    for (const owner of this.owners) {
      for (const cell of owner.cells) {
        // Copy the query before moving consumed food to another bucket.
        const nearby = [...this.index.near(cell.x, cell.y, cell.radius + 7)];
        for (const food of nearby) {
          if (distance(cell, food) > cell.radius) continue;
          cell.mass += food.mass;
          if (owner.id === 0) {
            this.stats.food++;
            this.burst(food.x, food.y, food.color, 2);
            arenaSound.play('eat');
          }
          this.resetFood(food);
        }
        for (const mass of this.ejected) {
          if (mass.mass <= 0 || this.time - mass.born < 0.7 || cell.mass < mass.mass * 1.15) continue;
          if (distance(cell, mass) < cell.radius - 3) {
            cell.mass += mass.mass;
            mass.mass = 0;
          }
        }
      }
    }
  }

  private consumeCells() {
    const cells = this.owners.flatMap(owner => owner.cells).sort((a, b) => b.mass - a.mass);
    for (let i = 0; i < cells.length; i++) {
      const big = cells[i];
      if (!big.alive) continue;
      for (let j = i + 1; j < cells.length; j++) {
        const small = cells[j];
        if (!small.alive || big.owner === small.owner || big.mass < small.mass * 1.18) continue;
        const bigOwner = this.owners[big.owner];
        const smallOwner = this.owners[small.owner];
        if (this.mode === 'teams' && bigOwner.team === smallOwner.team) continue;
        if (smallOwner.protectedUntil > this.time || bigOwner.protectedUntil > this.time) continue;
        if (distance(big, small) > big.radius - small.radius * 0.33) continue;
        big.mass += small.mass;
        small.alive = false;
        if (big.owner === 0) { this.stats.cells++; arenaSound.play('pop'); }
        if (small.owner === 0) this.stats.eatenBy = bigOwner.name;
        this.burst(small.x, small.y, smallOwner.color, 7);
      }
    }
    for (const owner of this.owners) {
      const hadCells = owner.cells.length > 0;
      owner.cells = owner.cells.filter(cell => cell.alive);
      if (hadCells && !owner.cells.length) owner.respawnAt = this.time + 2.5;
    }
  }

  private updateViruses(dt: number) {
    for (const virus of [...this.viruses]) {
      virus.x = clamp(virus.x + virus.vx * dt, virus.radius, WORLD_SIZE - virus.radius);
      virus.y = clamp(virus.y + virus.vy * dt, virus.radius, WORLD_SIZE - virus.radius);
      virus.vx *= Math.exp(-2.5 * dt);
      virus.vy *= Math.exp(-2.5 * dt);
      for (const mass of this.ejected) {
        if (mass.mass <= 0 || distance(mass, virus) > virus.radius) continue;
        mass.mass = 0;
        virus.fed++;
        if (virus.fed >= 7 && !virus.mother) {
          virus.fed = 0;
          const angle = Math.atan2(mass.vy, mass.vx);
          if (this.viruses.length < 38) this.viruses.push({ ...virus, id: this.nextId++, x: virus.x + Math.cos(angle) * 120, y: virus.y + Math.sin(angle) * 120, vx: Math.cos(angle) * 380, vy: Math.sin(angle) * 380 });
        }
      }
      if (virus.mother && this.time > virus.lastEmission + 0.7) {
        virus.lastEmission = this.time;
        for (let i = 0; i < 3; i++) {
          const angle = this.random() * Math.PI * 2;
          this.resetFood(this.food[Math.floor(this.random() * this.food.length)], virus.x + Math.cos(angle) * (virus.radius + 18 + this.random() * 70), virus.y + Math.sin(angle) * (virus.radius + 18 + this.random() * 70));
        }
      }
      let consumed = false;
      for (const owner of this.owners) {
        for (const cell of [...owner.cells]) {
          if (consumed || owner.protectedUntil > this.time) continue;
          const dist = distance(cell, virus);
          if (virus.mother && cell.mass < 350 && dist < virus.radius - cell.radius * 0.4) {
            cell.alive = false;
            if (owner.id === 0) this.stats.eatenBy = 'Mother Cell';
          } else if (cell.mass > (virus.mother ? 520 : 165) && dist < cell.radius - virus.radius * 0.28) {
            this.explode(owner, cell, virus.mother ? 100 : 65);
            virus.x = this.coordinate(180);
            virus.y = this.coordinate(180);
            virus.fed = 0;
            virus.lastEmission = this.time;
            consumed = true;
          }
        }
        const hadCells = owner.cells.length > 0;
        owner.cells = owner.cells.filter(cell => cell.alive);
        if (hadCells && !owner.cells.length) owner.respawnAt = this.time + 2.5;
      }
    }
  }

  private explode(owner: Organism, cell: Cell, bonus: number) {
    cell.mass += bonus;
    const count = Math.min(17 - owner.cells.length, Math.max(2, Math.floor(cell.mass / 28)));
    if (count < 2) return;
    const mass = cell.mass / count;
    cell.mass = mass;
    cell.mergeAt = this.time + 22;
    for (let i = 1; i < count; i++) {
      const angle = i / (count - 1) * Math.PI * 2;
      const piece = this.makeCell(owner.id, cell.x + Math.cos(angle) * 15, cell.y + Math.sin(angle) * 15, mass);
      piece.vx = Math.cos(angle) * (280 + this.random() * 220);
      piece.vy = Math.sin(angle) * (280 + this.random() * 220);
      piece.mergeAt = this.time + 22;
      owner.cells.push(piece);
    }
    if (owner.id === 0) arenaSound.play('pop');
  }

  private burst(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2;
      this.particles.push({ x, y, vx: Math.cos(angle) * 45, vy: Math.sin(angle) * 45, radius: 2 + this.random() * 3, color, life: 0.45 });
    }
  }

  private updateParticles(dt: number) {
    for (const particle of this.particles) { particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; }
    this.particles = this.particles.filter(particle => particle.life > 0).slice(-160);
  }

  private updateCamera(dt: number) {
    const owner = this.phase === 'spectating' ? this.owners[this.spectateId] : this.player;
    if (!owner?.cells.length) {
      if (this.phase === 'spectating') this.spectateNext();
      return;
    }
    let x = 0;
    let y = 0;
    let mass = 0;
    for (const cell of owner.cells) { x += cell.x * cell.mass; y += cell.y * cell.mass; mass += cell.mass; }
    x /= mass;
    y /= mass;
    const viewportScale = Math.min(1.25, Math.max(0.62, Math.min(this.width / 1100, this.height / 780)));
    const zoom = clamp(1.22 / Math.pow(Math.max(mass, 40) / 40, 0.19), 0.26, 1.22) * viewportScale * this.zoomOffset;
    const smoothing = 1 - Math.exp(-dt * 5);
    this.camera.x += (x - this.camera.x) * smoothing;
    this.camera.y += (y - this.camera.y) * smoothing;
    this.camera.zoom += (zoom - this.camera.zoom) * smoothing * 0.65;
  }

  snapshot(): ArenaSnapshot {
    const leaders = this.owners.filter(owner => owner.cells.length).map(owner => ({ id: owner.id, name: owner.name, color: owner.color,
      mass: Math.round(owner.cells.reduce((sum, cell) => sum + cell.mass, 0)), player: owner.id === 0 })).sort((a, b) => b.mass - a.mass);
    const teamMass = [0, 0, 0];
    for (const owner of this.owners) teamMass[owner.team] += owner.cells.reduce((sum, cell) => sum + cell.mass, 0);
    const total = teamMass.reduce((a, b) => a + b, 0) || 1;
    return { phase: this.phase, paused: this.paused, score: Math.round(this.playerMass), cells: this.player.cells.length,
      rank: leaders.findIndex(leader => leader.player) + 1, population: leaders.length, leaders: leaders.slice(0, 10), stats: { ...this.stats },
      teamShares: teamMass.map(mass => mass / total), spectating: this.owners[this.spectateId]?.name || '',
      mergeIn: this.player.cells.length > 1 ? Math.max(0, Math.ceil(Math.max(...this.player.cells.map(cell => cell.mergeAt)) - this.time)) : 0 };
  }
}