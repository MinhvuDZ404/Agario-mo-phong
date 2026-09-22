import { BALANCE, cellSpeed, massRadius, mergeDelay, zoomForMass } from './config';
import { arenaSound } from './sound';
import {
  CELL_COLORS, FOOD_COLORS, TEAM_COLORS,
  type AiArchetype, type ArenaSnapshot, type Cell, type EjectedMass, type Floater, type Food,
  type GameMode, type GamePhase, type Organism, type Particle, type RunStats, type SkinId, type Virus,
} from './types';

const WORLD = BALANCE.worldSize;
const GRID_SIZE = 140;
const NAMES = ['nova', 'moon', 'blob', 'Orbit', 'tiny', 'jelly', 'pixel', 'miso', 'cosmo', 'Boba', 'just a cell', 'Noodle', 'pluto', 'chill', 'big little', 'Mochi', 'nebula', 'peach', 'no name', 'echo', 'bloop', 'Sushi', 'coco', 'leaf', 'bubble', 'kiwi', 'hello', 'mango', 'noodle soup', 'squish', 'pudding', 'stardust', 'not food', 'panda', 'luna', 'slowly', 'taro', 'moss', 'little bean', 'daisy', 'marble', 'Cloud', 'mint', 'bonbon', 'jupiter', 'soda', 'sprout', 'wobble'];
const ARCHETYPES: AiArchetype[] = ['hunter', 'opportunist', 'coward', 'collector', 'wanderer', 'ambusher', 'survivor', 'giant', 'splitter'];

interface ArchetypeWeights {
  chase: number;
  flee: number;
  food: number;
  virusFear: number;
  virusBait: number;
  wander: number;
  splitUrge: number;
  predict: number;
}

const AI_WEIGHTS: Record<AiArchetype, ArchetypeWeights> = {
  hunter: { chase: 1.6, flee: 0.7, food: 0.6, virusFear: 1.0, virusBait: 0.0, wander: 0.3, splitUrge: 0.5, predict: 1.0 },
  opportunist: { chase: 1.2, flee: 1.0, food: 0.9, virusFear: 1.0, virusBait: 0.2, wander: 0.5, splitUrge: 0.35, predict: 0.7 },
  coward: { chase: 0.4, flee: 1.8, food: 1.0, virusFear: 1.2, virusBait: 0.8, wander: 0.6, splitUrge: 0.0, predict: 0.3 },
  collector: { chase: 0.5, flee: 1.1, food: 1.7, virusFear: 1.1, virusBait: 0.1, wander: 0.7, splitUrge: 0.05, predict: 0.2 },
  wanderer: { chase: 0.7, flee: 0.9, food: 0.8, virusFear: 0.9, virusBait: 0.2, wander: 1.6, splitUrge: 0.1, predict: 0.3 },
  ambusher: { chase: 1.3, flee: 0.9, food: 1.1, virusFear: 0.7, virusBait: 0.4, wander: 0.4, splitUrge: 0.6, predict: 0.8 },
  survivor: { chase: 0.6, flee: 1.5, food: 1.2, virusFear: 1.4, virusBait: 0.5, wander: 0.5, splitUrge: 0.05, predict: 0.4 },
  giant: { chase: 1.0, flee: 0.4, food: 1.0, virusFear: 1.6, virusBait: 0.0, wander: 0.5, splitUrge: 0.0, predict: 0.5 },
  splitter: { chase: 1.4, flee: 0.8, food: 0.7, virusFear: 1.0, virusBait: 0.1, wander: 0.4, splitUrge: 1.4, predict: 0.9 },
};

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
  floaters: Floater[] = [];
  camera = { x: WORLD / 2, y: WORLD / 2, zoom: 1 };
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
  private lastRank = 0;

  constructor(seed = 42791) {
    this.seed = seed >>> 0;
    this.populate();
  }

  private emptyStats(): RunStats {
    return { peak: BALANCE.startMass, food: 0, cells: 0, splitEats: 0, seconds: 0, bestRank: BALANCE.botCount + 1, eatenBy: '' };
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private coordinate(padding = 80) { return padding + this.random() * (WORLD - padding * 2); }

  get player() { return this.owners[0]; }
  get playerMass() { return this.player.cells.reduce((sum, cell) => sum + cell.mass, 0); }

  ownerById(id: number): Organism | undefined {
    return this.owners.find(owner => owner.id === id);
  }

  private makeCell(owner: number, x: number, y: number, mass: number): Cell {
    return {
      id: this.nextId++, owner, x, y, lx: x, ly: y,
      mass: Math.max(0.01, mass), radius: massRadius(mass),
      vx: 0, vy: 0, born: this.time, mergeAt: this.time, alive: true, pulse: 0,
    };
  }

  private makeOwner(id: number, name: string, color: string, skin: SkinId, team: number): Organism {
    const archetype = id === 0 ? 'opportunist' : ARCHETYPES[(id - 1) % ARCHETYPES.length];
    return {
      id, name, color, skin, team, archetype, cells: [],
      targetX: WORLD / 2, targetY: WORLD / 2,
      nextDecision: 0, splitAt: 0, respawnAt: 0, protectedUntil: 0,
    };
  }

  private populate() {
    this.nextId = 1;
    this.owners = [this.makeOwner(0, 'You', CELL_COLORS[0], 'classic', 0)];
    // Spawn scores keep elites away from the player's spawn point.
    for (let i = 0; i < BALANCE.botCount; i++) {
      const mass = i < BALANCE.eliteBotCount
        ? BALANCE.eliteBotTopMass - i * BALANCE.eliteBotStep
        : BALANCE.botMinMass + Math.pow(this.random(), 1.7) * (BALANCE.botMaxMass - BALANCE.botMinMass);
      let x = this.coordinate(240);
      const y = this.coordinate(240);
      if (Math.hypot(x - WORLD / 2, y - WORLD / 2) < 650 && mass > 100) x = 300 + i * 16;
      const skin: SkinId = i === 6 ? 'earth' : i === 16 ? '8ball' : i === 22 ? 'melon' : 'classic';
      const owner = this.makeOwner(i + 1, NAMES[i % NAMES.length], CELL_COLORS[i % CELL_COLORS.length], skin, i % 3);
      owner.cells = [this.makeCell(i + 1, x, y, mass)];
      owner.targetX = x;
      owner.targetY = y;
      owner.nextDecision = this.random() * 0.4;
      this.owners.push(owner);
    }
    this.food = [];
    this.index = new FoodIndex();
    for (let i = 0; i < BALANCE.foodCount; i++) this.addFood();
    this.viruses = [];
    for (let i = 0; i < BALANCE.virusCount; i++) {
      let x = this.coordinate(180);
      const y = this.coordinate(180);
      if (Math.hypot(x - WORLD / 2, y - WORLD / 2) < 240) x += 400;
      this.viruses.push({ id: this.nextId++, x, y, radius: BALANCE.virusRadius, vx: 0, vy: 0, fed: 0, mother: false, lastEmission: 0 });
    }
  }

  private addFood(x?: number, y?: number) {
    const food: Food = {
      id: this.nextId++,
      x: x ?? this.coordinate(12), y: y ?? this.coordinate(12),
      color: FOOD_COLORS[Math.floor(this.random() * FOOD_COLORS.length)],
      mass: BALANCE.pelletMinMass + this.random() * BALANCE.pelletBonusMass,
      radius: 3.2 + this.random() * 2.1,
    };
    this.food.push(food);
    this.index.add(food);
    return food;
  }

  private resetFood(food: Food, x?: number, y?: number) {
    this.index.remove(food);
    food.x = clamp(x ?? this.coordinate(12), 12, WORLD - 12);
    food.y = clamp(y ?? this.coordinate(12), 12, WORLD - 12);
    this.index.add(food);
  }

  private configureMode() {
    if (this.mode === 'teams') {
      this.owners.forEach(owner => { owner.color = TEAM_COLORS[owner.team]; owner.skin = 'classic'; });
    }
    if (this.mode === 'experimental') {
      for (let i = 0; i < BALANCE.motherCells && i < this.viruses.length; i++) {
        this.viruses[i].mother = true;
        this.viruses[i].radius = BALANCE.motherRadius;
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
    this.floaters = [];
    this.ejectAt = 0;
    this.rankAt = 0;
    this.lastRank = 0;
    this.zoomOffset = 1;
    this.player.name = name.trim().slice(0, 18) || 'Vô danh';
    this.player.skin = skin;
    this.player.color = color;
    this.player.cells = [this.makeCell(0, WORLD / 2, WORLD / 2, BALANCE.startMass)];
    this.player.protectedUntil = BALANCE.spawnProtection;
    this.camera = { x: WORLD / 2, y: WORLD / 2, zoom: 1.15 };
    this.configureMode();
    // The first few seconds teach movement without placing a giant on the spawn point.
    for (let i = 0; i < 45; i++) {
      const angle = this.random() * Math.PI * 2;
      const radius = 50 + this.random() * 400;
      this.resetFood(this.food[i], WORLD / 2 + Math.cos(angle) * radius, WORLD / 2 + Math.sin(angle) * radius);
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
    this.floaters = [];
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
    this.camera = { x: WORLD / 2, y: WORLD / 2, zoom: 1 };
  }

  /**
   * Public frame entry. Visual time always advances; simulation runs in fixed
   * sub-steps so collision and eating stay stable from 30 to 144 FPS and after
   * background tabs (dt is hard-clamped, never trusted).
   */
  update(dt: number) {
    if (!Number.isFinite(dt) || dt < 0) return;
    const safe = Math.min(dt, BALANCE.maxFrameDt);
    this.visualTime += dt;
    if (this.paused || this.phase === 'ended') return;
    if (this.phase === 'lobby') return;
    let remaining = safe;
    while (remaining > 0.0001) {
      const step = Math.min(BALANCE.fixedStep, remaining);
      remaining -= step;
      this.step(step);
      if (this.phase !== 'playing' && this.phase !== 'spectating') break;
    }
    if (this.phase === 'playing') {
      this.stats.peak = Math.max(this.stats.peak, Math.round(this.playerMass));
      if (this.time > this.rankAt && this.player.cells.length > 0) {
        const snapshot = this.snapshot();
        this.stats.bestRank = Math.min(this.stats.bestRank, snapshot.rank);
        if (this.lastRank > 0 && snapshot.rank < this.lastRank && snapshot.rank <= 10) {
          arenaSound.play('rank');
        }
        this.lastRank = snapshot.rank;
        this.rankAt = this.time + 0.8;
      }
    }
    this.updateCamera(safe);
  }

  private step(dt: number) {
    this.time += dt;
    if (this.phase === 'playing') this.stats.seconds += dt;
    const cells = this.owners.flatMap(owner => owner.cells).filter(cell => cell.alive);
    for (const owner of this.owners) {
      if (owner.id !== 0 && !owner.cells.length && this.time >= owner.respawnAt) {
        const spawn = this.pickSpawn();
        owner.cells = [this.makeCell(owner.id, spawn.x, spawn.y, BALANCE.botMinMass + this.random() * 95)];
        owner.protectedUntil = this.time + BALANCE.botProtection;
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
    this.updateFloaters(dt);
    if (this.phase === 'playing') {
      if (this.keys.has('w') && this.time >= this.ejectAt) this.eject();
      if (!this.player.cells.length) {
        this.phase = 'ended';
        arenaSound.play('end');
      }
    }
  }

  /** Spawn scoring: prefer low-density areas far from giants and viruses. */
  private pickSpawn(): { x: number; y: number } {
    let best = { x: this.coordinate(160), y: this.coordinate(160) };
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = this.coordinate(160);
      const y = this.coordinate(160);
      let score = this.random() * 20;
      for (const owner of this.owners) {
        for (const cell of owner.cells) {
          const dist = Math.hypot(cell.x - x, cell.y - y);
          if (cell.mass > 300 && dist < 700) score -= (700 - dist) / 10;
          else if (dist < 250) score -= (250 - dist) / 12;
        }
      }
      for (const virus of this.viruses) {
        const dist = Math.hypot(virus.x - x, virus.y - y);
        if (dist < 220) score -= (220 - dist) / 8;
      }
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    return best;
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

  /**
   * Utility AI: every think tick scores flee / chase / feed / wander options
   * and commits to the best one. Perception is range-limited — bots never cheat
   * with global knowledge.
   */
  private decide(owner: Organism, cells: Cell[]) {
    const weights = AI_WEIGHTS[owner.archetype];
    const focusX = this.phase === 'spectating' ? this.camera.x : (this.player.cells[0]?.x ?? WORLD / 2);
    const focusY = this.phase === 'spectating' ? this.camera.y : (this.player.cells[0]?.y ?? WORLD / 2);
    const main = owner.cells.reduce((a, b) => a.mass > b.mass ? a : b);
    const distToFocus = Math.hypot(main.x - focusX, main.y - focusY);
    // Simulation LOD: distant bots think less often; nearby play stays sharp.
    const lod = distToFocus > BALANCE.aiFarDistance ? 2.2 : 1;
    owner.nextDecision = this.time + (BALANCE.aiThinkMin + this.random() * BALANCE.aiThinkJitter) * lod;

    const perception = BALANCE.aiPerception * (owner.archetype === 'giant' ? 0.8 : 1);
    let fleeX = 0;
    let fleeY = 0;
    let threat = 0;
    let prey: Cell | null = null;
    let preyScore = 0;
    let hunterX = 0;

    for (const other of cells) {
      if (!other.alive || other.owner === owner.id) continue;
      const otherOwner = this.ownerById(other.owner);
      if (!otherOwner) continue;
      if (this.mode === 'teams' && otherOwner.team === owner.team) continue;
      const dist = distance(main, other);
      if (dist > perception) continue;
      if (other.mass > main.mass * BALANCE.aiFleeRatio && dist < other.radius + main.radius + BALANCE.aiFleeMargin) {
        const weight = ((other.radius + 180) / Math.max(20, dist - other.radius)) * weights.flee;
        fleeX += (main.x - other.x) / Math.max(1, dist) * weight;
        fleeY += (main.y - other.y) / Math.max(1, dist) * weight;
        threat += weight;
        hunterX = other.x;
      } else if (main.mass > other.mass * BALANCE.aiChaseRatio && otherOwner.protectedUntil < this.time) {
        const score = (other.mass / Math.max(80, dist)) * weights.chase;
        if (score > preyScore) { prey = other; preyScore = score; }
      }
    }

    for (const virus of this.viruses) {
      if (main.mass < (virus.mother ? 480 : 140)) continue;
      const dist = distance(main, virus);
      if (dist < main.radius + virus.radius + 65) {
        const weight = 1.6 * weights.virusFear;
        fleeX += (main.x - virus.x) / Math.max(1, dist) * weight;
        fleeY += (main.y - virus.y) / Math.max(1, dist) * weight;
        threat += weight * 0.5;
      }
    }

    const fleeUtility = threat;
    const chaseUtility = prey ? preyScore * 3.2 : 0;

    if (fleeUtility > chaseUtility && fleeUtility > 0.35) {
      // Escape artists run toward a virus to force a large chaser to swerve.
      const bait = weights.virusBait > 0.3 && main.mass < 400 && hunterX !== 0;
      if (bait) {
        let shield: Virus | null = null;
        let shieldDist = 900;
        for (const virus of this.viruses) {
          if (virus.mother) continue;
          const dist = distance(main, virus);
          if (dist < shieldDist) { shield = virus; shieldDist = dist; }
        }
        if (shield && this.random() < weights.virusBait) {
          owner.targetX = shield.x;
          owner.targetY = shield.y;
          return;
        }
      }
      fleeX += (WORLD / 2 - main.x) / WORLD * (main.x < 200 || main.x > WORLD - 200 ? 2 : 0.08);
      fleeY += (WORLD / 2 - main.y) / WORLD * (main.y < 200 || main.y > WORLD - 200 ? 2 : 0.08);
      // Sidestep: don't flee in a straight predictable line.
      const side = this.random() < 0.5 ? 1 : -1;
      const length = Math.hypot(fleeX, fleeY) || 1;
      const curve = 0.35 * side;
      const curvedX = fleeX / length - (-fleeY / length) * curve;
      const curvedY = fleeY / length - (fleeX / length) * curve;
      owner.targetX = clamp(main.x + curvedX * 400, 60, WORLD - 60);
      owner.targetY = clamp(main.y + curvedY * 400, 60, WORLD - 60);
    } else if (prey && chaseUtility > 0.25) {
      // Intercept with velocity prediction instead of chasing the tail.
      const target = prey as Cell;
      const pvx = (target.x - target.lx) * 60;
      const pvy = (target.y - target.ly) * 60;
      const dist = distance(main, target);
      const lead = clamp(dist / 900, 0, 1) * weights.predict * 0.55;
      owner.targetX = clamp(target.x + pvx * lead * 0.12, 40, WORLD - 40);
      owner.targetY = clamp(target.y + pvy * lead * 0.12, 40, WORLD - 40);
      const canSplit = owner.cells.length < 3 && this.time > owner.splitAt;
      if (canSplit && main.mass > target.mass * BALANCE.aiSplitRatio && dist < main.radius + BALANCE.aiSplitRange) {
        if (this.random() < 0.07 + weights.splitUrge * 0.09) {
          this.splitOwner(owner, Math.atan2(target.y - main.y, target.x - main.x));
        }
      }
    } else {
      let nearest: Food | null = null;
      let nearestDist = BALANCE.aiFoodSearch + 80;
      for (const food of this.index.near(main.x, main.y, BALANCE.aiFoodSearch)) {
        const d = distance(main, food);
        if (d < nearestDist && d > 2) { nearest = food; nearestDist = d; }
      }
      const wantsFood = nearest && (this.random() < 0.35 + weights.food * 0.3 || weights.wander < 1.2);
      if (wantsFood && nearest) {
        owner.targetX = (nearest as Food).x;
        owner.targetY = (nearest as Food).y;
      } else if (distance(main, { x: owner.targetX, y: owner.targetY }) < 100 || this.random() < 0.06 * weights.wander) {
        // Wanderers roam; giants hold the center; ambushers lurk near viruses.
        if (owner.archetype === 'ambusher' && this.viruses.length && this.random() < 0.5) {
          const virus = this.viruses[Math.floor(this.random() * this.viruses.length)];
          owner.targetX = clamp(virus.x + (this.random() - 0.5) * 500, 60, WORLD - 60);
          owner.targetY = clamp(virus.y + (this.random() - 0.5) * 500, 60, WORLD - 60);
        } else if (owner.archetype === 'giant') {
          owner.targetX = WORLD / 2 + (this.random() - 0.5) * 1400;
          owner.targetY = WORLD / 2 + (this.random() - 0.5) * 1400;
        } else {
          owner.targetX = this.coordinate(200);
          owner.targetY = this.coordinate(200);
        }
      }
    }
  }

  private moveOwner(owner: Organism, dt: number) {
    for (const cell of owner.cells) {
      if (!cell.alive) continue;
      cell.lx = cell.x;
      cell.ly = cell.y;
      const dx = owner.targetX - cell.x;
      const dy = owner.targetY - cell.y;
      const length = Math.hypot(dx, dy);
      const speed = cellSpeed(cell.mass);
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
      cell.pulse = Math.max(0, cell.pulse - dt * 3.2);
      // Effective radius can never exceed half the arena, otherwise clamping
      // inverts and ejects the cell out of bounds (extreme-mass safety).
      const bound = Math.min(cell.radius, WORLD / 2);
      cell.x = clamp(cell.x, bound, WORLD - bound);
      cell.y = clamp(cell.y, bound, WORLD - bound);
      if (cell.mass > BALANCE.decayStartMass) cell.mass -= cell.mass * BALANCE.decayRate * dt;
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
          if (dist < Math.max(a.radius, b.radius) * BALANCE.mergeOverlap) {
            // Merge conserves mass exactly: the survivor absorbs the other.
            const total = a.mass + b.mass;
            a.x = (a.x * a.mass + b.x * b.mass) / total;
            a.y = (a.y * a.mass + b.y * b.mass) / total;
            a.mass = total;
            a.pulse = 1;
            b.alive = false;
            if (owner.id === 0) {
              arenaSound.play('merge');
              this.addFloater(a.x, a.y - a.radius, 'Hợp nhất!', '#ffffff');
            }
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

  split(): boolean {
    if (this.phase !== 'playing' || this.paused) return false;
    const angle = Math.atan2(this.pointer.y, this.pointer.x);
    const result = this.splitOwner(this.player, angle);
    if (result) arenaSound.play('split');
    else arenaSound.play('denied');
    return result;
  }

  private splitOwner(owner: Organism, angle: number): boolean {
    const original = [...owner.cells].sort((a, b) => b.mass - a.mass);
    let didSplit = false;
    for (const cell of original) {
      if (owner.cells.length >= BALANCE.maxFragments) break;
      if (cell.mass < BALANCE.minSplitMass) continue;
      // Split conserves mass exactly: two halves equal the whole.
      cell.mass /= 2;
      const radius = massRadius(cell.mass);
      const newCell = this.makeCell(owner.id, cell.x + Math.cos(angle) * radius, cell.y + Math.sin(angle) * radius, cell.mass);
      newCell.radius = radius * 0.7;
      newCell.vx = Math.cos(angle) * BALANCE.splitImpulse;
      newCell.vy = Math.sin(angle) * BALANCE.splitImpulse;
      cell.mergeAt = newCell.mergeAt = this.time + mergeDelay(cell.mass);
      owner.cells.push(newCell);
      didSplit = true;
    }
    if (didSplit) owner.splitAt = this.time + BALANCE.splitCooldown;
    return didSplit;
  }

  eject(): boolean {
    if (this.phase !== 'playing' || this.paused || this.time < this.ejectAt) return false;
    let didEject = false;
    for (const cell of this.player.cells) {
      if (cell.mass < BALANCE.minEjectMass) continue;
      // Enforce the cap at insertion time so multi-fragment ejects can never
      // overflow between the periodic trims in updateEjected().
      if (this.ejected.length >= BALANCE.maxEjected) {
        this.ejected.sort((a, b) => a.born - b.born);
        this.ejected.shift();
      }
      const angle = Math.atan2(this.player.targetY - cell.y, this.player.targetX - cell.x);
      const radius = massRadius(cell.mass);
      this.ejected.push({
        id: this.nextId++,
        x: cell.x + Math.cos(angle) * (radius + 14), y: cell.y + Math.sin(angle) * (radius + 14),
        vx: Math.cos(angle) * BALANCE.ejectImpulse, vy: Math.sin(angle) * BALANCE.ejectImpulse,
        color: this.player.color, mass: BALANCE.ejectMass, radius: 9, born: this.time, owner: 0,
      });
      cell.mass -= BALANCE.ejectCost;
      didEject = true;
    }
    this.ejectAt = this.time + BALANCE.ejectCooldown;
    if (didEject) arenaSound.play('eject');
    return didEject;
  }

  private updateEjected(dt: number) {
    for (const mass of this.ejected) {
      mass.x = clamp(mass.x + mass.vx * dt, 10, WORLD - 10);
      mass.y = clamp(mass.y + mass.vy * dt, 10, WORLD - 10);
      mass.vx *= Math.exp(-3.5 * dt);
      mass.vy *= Math.exp(-3.5 * dt);
    }
    this.ejected = this.ejected.filter(mass => this.time - mass.born < BALANCE.ejectLifetime && mass.mass > 0);
    // Hard cap so eject spam can never grow memory or collision cost unboundedly.
    if (this.ejected.length > BALANCE.maxEjected) {
      this.ejected.sort((a, b) => a.born - b.born);
      this.ejected.splice(0, this.ejected.length - BALANCE.maxEjected);
    }
  }

  private consumeFood() {
    for (const owner of this.owners) {
      for (const cell of owner.cells) {
        // Copy the query before moving consumed food to another bucket.
        const nearby = [...this.index.near(cell.x, cell.y, cell.radius + 7)];
        for (const food of nearby) {
          if (distance(cell, food) > cell.radius) continue;
          cell.mass += food.mass;
          cell.pulse = Math.min(1, cell.pulse + 0.25);
          if (owner.id === 0) {
            this.stats.food++;
            this.burst(food.x, food.y, food.color, 2);
            arenaSound.play('eat');
          }
          this.resetFood(food);
        }
        for (const mass of this.ejected) {
          if (mass.mass <= 0 || this.time - mass.born < BALANCE.ejectPickupDelay || cell.mass < mass.mass * BALANCE.ejectEatRatio) continue;
          if (distance(cell, mass) < cell.radius - 3) {
            cell.mass += mass.mass;
            cell.pulse = 1;
            mass.mass = 0;
          }
        }
      }
    }
  }

  private consumeCells() {
    // Deterministic resolution: biggest cells eat first, each victim only once.
    const cells = this.owners.flatMap(owner => owner.cells).sort((a, b) => b.mass - a.mass || a.id - b.id);
    for (let i = 0; i < cells.length; i++) {
      const big = cells[i];
      if (!big.alive) continue;
      for (let j = i + 1; j < cells.length; j++) {
        const small = cells[j];
        if (!small.alive || big.owner === small.owner || big.mass < small.mass * BALANCE.eatRatio) continue;
        // Broad-phase: eating requires deep overlap, so pairs farther apart
        // than the predator's radius on either axis can never interact.
        if (Math.abs(small.x - big.x) > big.radius || Math.abs(small.y - big.y) > big.radius) continue;
        const bigOwner = this.ownerById(big.owner);
        const smallOwner = this.ownerById(small.owner);
        if (!bigOwner || !smallOwner) continue;
        if (this.mode === 'teams' && bigOwner.team === smallOwner.team) continue;
        if (smallOwner.protectedUntil > this.time || bigOwner.protectedUntil > this.time) continue;
        if (distance(big, small) > big.radius - small.radius * BALANCE.eatOverlapFactor) continue;
        big.mass += small.mass;
        big.pulse = 1;
        small.alive = false;
        if (big.owner === 0) {
          this.stats.cells++;
          if (this.player.cells.length > 1) this.stats.splitEats++;
          arenaSound.play('pop');
          this.addFloater(small.x, small.y, `+${Math.round(small.mass)}`, '#ffffff');
        }
        if (small.owner === 0) this.stats.eatenBy = bigOwner.name;
        this.burst(small.x, small.y, smallOwner.color, 7);
      }
    }
    for (const owner of this.owners) {
      const hadCells = owner.cells.length > 0;
      owner.cells = owner.cells.filter(cell => cell.alive);
      if (hadCells && !owner.cells.length) owner.respawnAt = this.time + BALANCE.respawnDelay;
    }
  }

  private updateViruses(dt: number) {
    for (const virus of [...this.viruses]) {
      virus.x = clamp(virus.x + virus.vx * dt, virus.radius, WORLD - virus.radius);
      virus.y = clamp(virus.y + virus.vy * dt, virus.radius, WORLD - virus.radius);
      virus.vx *= Math.exp(-2.5 * dt);
      virus.vy *= Math.exp(-2.5 * dt);
      for (const mass of this.ejected) {
        if (mass.mass <= 0 || distance(mass, virus) > virus.radius) continue;
        mass.mass = 0;
        virus.fed++;
        if (virus.fed >= BALANCE.virusFeedThreshold && !virus.mother) {
          virus.fed = 0;
          const angle = Math.atan2(mass.vy, mass.vx);
          if (this.viruses.length < BALANCE.maxViruses) {
            this.viruses.push({
              ...virus,
              id: this.nextId++,
              x: clamp(virus.x + Math.cos(angle) * 120, virus.radius, WORLD - virus.radius),
              y: clamp(virus.y + Math.sin(angle) * 120, virus.radius, WORLD - virus.radius),
              vx: Math.cos(angle) * 380, vy: Math.sin(angle) * 380,
            });
          }
        }
      }
      if (virus.mother && this.time > virus.lastEmission + BALANCE.motherEmissionInterval) {
        virus.lastEmission = this.time;
        for (let i = 0; i < BALANCE.motherEmissionCount; i++) {
          const angle = this.random() * Math.PI * 2;
          const offset = virus.radius + 18 + this.random() * 70;
          this.resetFood(
            this.food[Math.floor(this.random() * this.food.length)],
            virus.x + Math.cos(angle) * offset,
            virus.y + Math.sin(angle) * offset,
          );
        }
      }
      let consumed = false;
      for (const owner of this.owners) {
        for (const cell of [...owner.cells]) {
          if (consumed || !cell.alive || owner.protectedUntil > this.time) continue;
          const dist = distance(cell, virus);
          if (virus.mother && cell.mass < BALANCE.motherDigestMass && dist < virus.radius - cell.radius * 0.4) {
            cell.alive = false;
            if (owner.id === 0) this.stats.eatenBy = 'Mother Cell';
          } else if (cell.mass > (virus.mother ? BALANCE.motherTriggerMass : BALANCE.virusTriggerMass) && dist < cell.radius - virus.radius * 0.28) {
            this.explode(owner, cell, virus.mother ? BALANCE.motherBonusMass : BALANCE.virusBonusMass);
            virus.x = this.coordinate(180);
            virus.y = this.coordinate(180);
            virus.fed = 0;
            virus.lastEmission = this.time;
            consumed = true;
          }
        }
        const hadCells = owner.cells.length > 0;
        owner.cells = owner.cells.filter(cell => cell.alive);
        if (hadCells && !owner.cells.length) owner.respawnAt = this.time + BALANCE.respawnDelay;
      }
    }
  }

  private explode(owner: Organism, cell: Cell, bonus: number) {
    cell.mass += bonus;
    const capacity = BALANCE.maxFragments + 1 - owner.cells.length;
    if (capacity < 2) {
      // At the fragment cap the virus still punishes: burn mass instead of bursting.
      cell.mass = Math.max(BALANCE.minSplitMass, cell.mass * 0.85);
      cell.mergeAt = this.time + BALANCE.virusMergeDelay;
      if (owner.id === 0) arenaSound.play('virus');
      return;
    }
    const count = Math.min(capacity, Math.max(2, Math.floor(cell.mass / BALANCE.virusMinBurstMass)));
    const mass = cell.mass / count;
    cell.mass = mass;
    cell.mergeAt = this.time + BALANCE.virusMergeDelay;
    for (let i = 1; i < count; i++) {
      const angle = i / (count - 1) * Math.PI * 2;
      const piece = this.makeCell(owner.id, cell.x + Math.cos(angle) * 15, cell.y + Math.sin(angle) * 15, mass);
      piece.vx = Math.cos(angle) * (280 + this.random() * 220);
      piece.vy = Math.sin(angle) * (280 + this.random() * 220);
      piece.mergeAt = this.time + BALANCE.virusMergeDelay;
      owner.cells.push(piece);
    }
    if (owner.id === 0) {
      arenaSound.play('virus');
      this.addFloater(cell.x, cell.y - cell.radius, 'Virus!', '#9bcf78');
    }
  }

  private burst(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2;
      this.particles.push({ x, y, vx: Math.cos(angle) * 45, vy: Math.sin(angle) * 45, radius: 2 + this.random() * 3, color, life: 0.45 });
    }
  }

  private updateParticles(dt: number) {
    for (const particle of this.particles) { particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; }
    this.particles = this.particles.filter(particle => particle.life > 0).slice(-BALANCE.maxParticles);
  }

  private addFloater(x: number, y: number, text: string, color: string) {
    if (this.floaters.length >= BALANCE.maxFloaters) this.floaters.shift();
    this.floaters.push({ x, y, text, color, life: 0.9, ttl: 0.9 });
  }

  private updateFloaters(dt: number) {
    for (const floater of this.floaters) {
      floater.life -= dt;
      floater.y -= 34 * dt;
    }
    this.floaters = this.floaters.filter(floater => floater.life > 0);
  }

  private updateCamera(dt: number) {
    const owner = this.phase === 'spectating' ? this.ownerById(this.spectateId) : this.player;
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
    const zoom = clamp(zoomForMass(mass), BALANCE.zoomMin, BALANCE.zoomMax) * viewportScale * this.zoomOffset;
    const smoothing = 1 - Math.exp(-dt * BALANCE.cameraSmoothing);
    this.camera.x += (x - this.camera.x) * smoothing;
    this.camera.y += (y - this.camera.y) * smoothing;
    this.camera.zoom += (zoom - this.camera.zoom) * smoothing * 0.65;
  }

  /**
   * Structural invariant check used by tests and the debug overlay.
   * Returns a list of human-readable violations; empty means healthy.
   */
  validateInvariants(): string[] {
    const violations: string[] = [];
    const ids = new Set<number>();
    const checkId = (id: number, label: string) => {
      if (ids.has(id)) violations.push(`duplicate id ${id} (${label})`);
      ids.add(id);
    };
    const finite = (value: number, label: string) => {
      if (!Number.isFinite(value)) violations.push(`non-finite ${label}: ${value}`);
    };
    for (const owner of this.owners) {
      if (owner.cells.length > BALANCE.maxFragments + 1) {
        violations.push(`owner ${owner.id} exceeds fragment cap`);
      }
      for (const cell of owner.cells) {
        checkId(cell.id, `cell of owner ${owner.id}`);
        if (!cell.alive) violations.push(`dead cell ${cell.id} still listed`);
        if (cell.mass < 0) violations.push(`negative mass on cell ${cell.id}`);
        finite(cell.x, `cell ${cell.id} x`);
        finite(cell.y, `cell ${cell.id} y`);
        finite(cell.mass, `cell ${cell.id} mass`);
        finite(cell.radius, `cell ${cell.id} radius`);
        finite(cell.vx, `cell ${cell.id} vx`);
        finite(cell.vy, `cell ${cell.id} vy`);
        if (cell.x < -1 || cell.x > WORLD + 1 || cell.y < -1 || cell.y > WORLD + 1) {
          violations.push(`cell ${cell.id} outside arena`);
        }
      }
    }
    for (const mass of this.ejected) {
      checkId(mass.id, 'ejected');
      if (mass.mass < 0) violations.push(`negative ejected mass ${mass.id}`);
      finite(mass.x, `ejected ${mass.id} x`);
      finite(mass.y, `ejected ${mass.id} y`);
    }
    for (const virus of this.viruses) {
      checkId(virus.id, 'virus');
      finite(virus.x, `virus ${virus.id} x`);
      finite(virus.y, `virus ${virus.id} y`);
      if (virus.radius <= 0) violations.push(`invalid virus radius ${virus.id}`);
    }
    if (this.ejected.length > BALANCE.maxEjected) violations.push('ejected mass over cap');
    if (this.viruses.length > BALANCE.maxViruses + BALANCE.motherCells) violations.push('virus over cap');
    return violations;
  }

  /** Diagnostics for the debug overlay and stress tests. */
  diagnostics() {
    return {
      time: this.time,
      cells: this.owners.reduce((sum, owner) => sum + owner.cells.length, 0),
      food: this.food.length,
      ejected: this.ejected.length,
      viruses: this.viruses.length,
      particles: this.particles.length,
      floaters: this.floaters.length,
      zoom: this.camera.zoom,
    };
  }

  snapshot(): ArenaSnapshot {
    const leaders = this.owners.filter(owner => owner.cells.length).map(owner => ({
      id: owner.id, name: owner.name, color: owner.color,
      mass: Math.round(owner.cells.reduce((sum, cell) => sum + cell.mass, 0)), player: owner.id === 0,
    })).sort((a, b) => b.mass - a.mass);
    const teamMass = [0, 0, 0];
    for (const owner of this.owners) teamMass[owner.team] += owner.cells.reduce((sum, cell) => sum + cell.mass, 0);
    const total = teamMass.reduce((a, b) => a + b, 0) || 1;
    return {
      phase: this.phase, paused: this.paused, score: Math.round(this.playerMass), cells: this.player.cells.length,
      rank: leaders.findIndex(leader => leader.player) + 1, population: leaders.length, leaders: leaders.slice(0, 10), stats: { ...this.stats },
      teamShares: teamMass.map(mass => mass / total), spectating: this.ownerById(this.spectateId)?.name || '',
      mergeIn: this.player.cells.length > 1 ? Math.max(0, Math.ceil(Math.max(...this.player.cells.map(cell => cell.mergeAt)) - this.time)) : 0,
    };
  }
}
