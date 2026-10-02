import {
  buildReport, createBrain, createTotals, onRespawn, recordDeath, recordOutcome, recordVirusPop, think,
  type AiMark, type AiReport, type AiTotals, type BotBrain,
} from './ai';
import { AI, BALANCE, cellSpeed, massRadius, mergeDelay, zoomForMass } from './config';
import { arenaSound } from './sound';
import {
  CELL_COLORS, FOOD_COLORS, TEAM_COLORS,
  type ActiveEmote, type AiArchetype, type ArenaSnapshot, type Cell, type CombatNotice,
  type EjectedMass, type EmoteKind, type Floater, type Food,
  type GameMode, type GamePhase, type MeteorAlert, type Organism, type Particle, type RunStats, type SkinId, type Virus,
} from './types';

const WORLD = BALANCE.worldSize;
const NAMES = ['nova', 'moon', 'blob', 'Orbit', 'tiny', 'jelly', 'pixel', 'miso', 'cosmo', 'Boba', 'just a cell', 'Noodle', 'pluto', 'chill', 'big little', 'Mochi', 'nebula', 'peach', 'no name', 'echo', 'bloop', 'Sushi', 'coco', 'leaf', 'bubble', 'kiwi', 'hello', 'mango', 'noodle soup', 'squish', 'pudding', 'stardust', 'not food', 'panda', 'luna', 'slowly', 'taro', 'moss', 'little bean', 'daisy', 'marble', 'Cloud', 'mint', 'bonbon', 'jupiter', 'soda', 'sprout', 'wobble'];
const ARCHETYPES: AiArchetype[] = ['hunter', 'opportunist', 'coward', 'collector', 'wanderer', 'ambusher', 'survivor', 'giant', 'splitter'];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

const GRID_COLS = 40;
const GRID_ROWS = 40;
const GRID_CELL_SIZE = 160;

// Food stays indexed as it respawns, so bots and cells only inspect nearby buckets.
class FoodIndex {
  private buckets: (Food[] | undefined)[] = new Array(GRID_COLS * GRID_ROWS);

  private key(x: number, y: number): number {
    const gx = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(x / GRID_CELL_SIZE)));
    const gy = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(y / GRID_CELL_SIZE)));
    return gx + gy * GRID_COLS;
  }

  add(food: Food) {
    const k = this.key(food.x, food.y);
    let bucket = this.buckets[k];
    if (!bucket) {
      bucket = [];
      this.buckets[k] = bucket;
    }
    bucket.push(food);
  }

  remove(food: Food) {
    const k = this.key(food.x, food.y);
    const bucket = this.buckets[k];
    if (!bucket) return;
    const idx = bucket.indexOf(food);
    if (idx !== -1) {
      const last = bucket.pop()!;
      if (idx < bucket.length) {
        bucket[idx] = last;
      }
    }
  }

  forEachNear(x: number, y: number, radius: number, cb: (food: Food) => boolean | void) {
    const left = Math.max(0, Math.floor((x - radius) / GRID_CELL_SIZE));
    const right = Math.min(GRID_COLS - 1, Math.floor((x + radius) / GRID_CELL_SIZE));
    const top = Math.max(0, Math.floor((y - radius) / GRID_CELL_SIZE));
    const bottom = Math.min(GRID_ROWS - 1, Math.floor((y + radius) / GRID_CELL_SIZE));
    for (let gy = top; gy <= bottom; gy++) {
      const rowOffset = gy * GRID_COLS;
      for (let gx = left; gx <= right; gx++) {
        const bucket = this.buckets[rowOffset + gx];
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          if (cb(bucket[i]) === false) return;
        }
      }
    }
  }

  *near(x: number, y: number, radius: number): Generator<Food> {
    const left = Math.max(0, Math.floor((x - radius) / GRID_CELL_SIZE));
    const right = Math.min(GRID_COLS - 1, Math.floor((x + radius) / GRID_CELL_SIZE));
    const top = Math.max(0, Math.floor((y - radius) / GRID_CELL_SIZE));
    const bottom = Math.min(GRID_ROWS - 1, Math.floor((y + radius) / GRID_CELL_SIZE));
    for (let gy = top; gy <= bottom; gy++) {
      const rowOffset = gy * GRID_COLS;
      for (let gx = left; gx <= right; gx++) {
        const bucket = this.buckets[rowOffset + gx];
        if (bucket) {
          for (let i = 0; i < bucket.length; i++) {
            yield bucket[i];
          }
        }
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
  /** Dev-only strategy overlay. Production stays off unless `?debug=1`. */
  aiDebug = false;
  speedBoostUntil = 0;
  royaleRadius = WORLD / 2;
  combatNotices: CombatNotice[] = [];
  killStreak = 0;
  lastKillTime = 0;
  royaleWinner = false;
  activeEmotes: ActiveEmote[] = [];
  meteorAlert: MeteorAlert | null = null;
  private nextMeteorTime = 50;
  private bossShockwaveAt = 0;
  private bossSpikeAt = 0;
  private lastBotEmoteCheck = 0;
  private bossDefeated = false;
  private lastRoyaleWarning = 0;
  private nextId = 1;
  private seed = 42791;
  private index = new FoodIndex();
  private ejectAt = 0;
  private rankAt = 0;
  private lastRank = 0;
  private brains = new Map<number, BotBrain>();
  private ownerMap = new Map<number, Organism>();
  private aiTotals: AiTotals = createTotals();
  private eatenFoodScratch: Food[] = [];
  private cellBuffer: Cell[] = [];
  private activeCellList: Cell[] = [];
  private visibleCellsBuffer: Cell[] = [];
  private visibleVirusesBuffer: Virus[] = [];
  private visibleEjectedBuffer: EjectedMass[] = [];
  /** Wall-clock diagnostics only; never feeds back into deterministic gameplay. */
  private aiTimeMs = 0;
  private aiDecisions = 0;
  private aiSlowestMs = 0;
  private stepTimeMs = 0;
  private stepCount = 0;
  private static readonly NO_MARKS: AiMark[] = [];

  constructor(seed = 42791) {
    this.seed = seed >>> 0;
    this.populate();
  }

  triggerEmote(kind: EmoteKind, ownerId = 0) {
    const owner = this.ownerById(ownerId);
    if (!owner?.cells.length) return;
    const emojiMap: Record<EmoteKind, string> = {
      cool: '😎',
      panic: '😱',
      devil: '😈',
      crown: '👑',
      heart: '❤️',
      lightning: '⚡',
    };
    const main = owner.cells.reduce((max, c) => (c.mass > max.mass ? c : max), owner.cells[0]);
    this.activeEmotes.push({
      ownerId,
      kind,
      emoji: emojiMap[kind] || '😎',
      x: main.x,
      y: main.y - main.radius - 24,
      born: this.time,
      duration: 2.5,
    });
    if (this.activeEmotes.length > 25) this.activeEmotes.shift();
    if (ownerId === 0) arenaSound.play('emote');
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

  addNotice(text: string, highlight = false) {
    this.combatNotices.push({ id: this.nextId++, text, time: this.time, highlight });
    if (this.combatNotices.length > 5) this.combatNotices.shift();
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
    const roll = this.random();
    let kind: 'normal' | 'gold' | 'speed' = 'normal';
    let color = FOOD_COLORS[Math.floor(this.random() * FOOD_COLORS.length)];
    let mass = BALANCE.pelletMinMass + this.random() * BALANCE.pelletBonusMass;
    let radius = 3.2 + this.random() * 2.1;
    if (roll < 0.025) {
      kind = 'gold';
      color = '#ffd700';
      mass = 25;
      radius = 7.5;
    } else if (roll < 0.045) {
      kind = 'speed';
      color = '#00f2fe';
      mass = 12;
      radius = 6.2;
    }
    const food: Food = {
      id: this.nextId++,
      x: x ?? this.coordinate(12), y: y ?? this.coordinate(12),
      color,
      mass,
      radius,
      kind,
    };
    this.food.push(food);
    this.index.add(food);
    return food;
  }

  private resetFood(food: Food, x?: number, y?: number) {
    this.index.remove(food);
    const roll = this.random();
    if (roll < 0.025) {
      food.kind = 'gold';
      food.color = '#ffd700';
      food.mass = 25;
      food.radius = 7.5;
    } else if (roll < 0.045) {
      food.kind = 'speed';
      food.color = '#00f2fe';
      food.mass = 12;
      food.radius = 6.2;
    } else {
      food.kind = 'normal';
      food.color = FOOD_COLORS[Math.floor(this.random() * FOOD_COLORS.length)];
      food.mass = BALANCE.pelletMinMass + this.random() * BALANCE.pelletBonusMass;
      food.radius = 3.2 + this.random() * 2.1;
    }
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
    if (this.mode === 'boss') {
      const titan = this.makeOwner(999, 'KRAKEN TITAN', '#150d2a', 'portal', 0);
      titan.cells = [this.makeCell(999, WORLD / 2, WORLD / 2, BALANCE.bossMass)];
      titan.targetX = WORLD / 2;
      titan.targetY = WORLD / 2;
      this.owners.push(titan);
      this.addNotice('⚔️ KRAKEN TITAN ĐÃ THỨC TỈNH Ở TRUNG TÂM ARENA!', true);
      this.bossDefeated = false;
      this.bossShockwaveAt = this.time + 4.5;
      this.bossSpikeAt = this.time + 7.5;
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
    this.activeEmotes = [];
    this.meteorAlert = null;
    this.nextMeteorTime = 50;
    this.bossDefeated = false;
    this.ejectAt = 0;
    this.rankAt = 0;
    this.lastRank = 0;
    this.brains.clear();
    this.aiTotals = createTotals();
    this.aiTimeMs = 0;
    this.aiDecisions = 0;
    this.aiSlowestMs = 0;
    this.stepTimeMs = 0;
    this.stepCount = 0;
    this.seedBrains();
    this.zoomOffset = 1;
    this.player.name = name.trim().slice(0, 18) || 'Vô danh';
    this.player.skin = skin;
    this.player.color = color;
    const startX = this.mode === 'boss' ? WORLD / 2 - 1200 : WORLD / 2;
    const startY = this.mode === 'boss' ? WORLD / 2 - 1200 : WORLD / 2;
    this.player.cells = [this.makeCell(0, startX, startY, BALANCE.startMass)];
    this.player.protectedUntil = BALANCE.spawnProtection;
    this.speedBoostUntil = 0;
    this.royaleRadius = WORLD / 2;
    this.combatNotices = [];
    this.killStreak = 0;
    this.lastKillTime = 0;
    this.royaleWinner = false;
    this.lastRoyaleWarning = 0;
    this.camera = { x: startX, y: startY, zoom: 1.15 };
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
    this.brains.clear();
    this.aiTotals = createTotals();
    this.aiTimeMs = 0;
    this.aiDecisions = 0;
    this.aiSlowestMs = 0;
    this.stepTimeMs = 0;
    this.stepCount = 0;
    this.seedBrains();
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
    const started = performance.now();
    this.time += dt;
    if (this.phase === 'playing') this.stats.seconds += dt;
    if (this.mode === 'royale') {
      if (this.time > 15) {
        this.royaleRadius = Math.max(260, WORLD / 2 - (this.time - 15) * 16);
        if (this.time - this.lastRoyaleWarning > 18 && this.royaleRadius > 350) {
          this.lastRoyaleWarning = this.time;
          arenaSound.play('royale_alarm');
          this.addNotice('⚡ CẢNH BÁO: VÒNG BO ĐANG CO LẠI!', true);
        }
      }
      for (const owner of this.owners) {
        for (const cell of owner.cells) {
          const dist = Math.hypot(cell.x - WORLD / 2, cell.y - WORLD / 2);
          if (dist > this.royaleRadius) {
            cell.mass = Math.max(10, cell.mass - cell.mass * 0.045 * dt);
            if (this.random() < 0.1) this.burst(cell.x, cell.y, '#a855f7', 1);
          }
        }
      }
      const alive = this.owners.filter(o => o.cells.length > 0);
      if (alive.length === 1 && alive[0].id === 0 && !this.royaleWinner) {
        this.royaleWinner = true;
        arenaSound.play('achievement');
        this.addNotice('👑 VICTORY ROYALE! BẠN LÀ NGƯỜI SỐNG SÓT CUỐI CÙNG!', true);
      }
    }

    // Emotes tracking
    for (const emote of this.activeEmotes) {
      const owner = this.ownerById(emote.ownerId);
      if (owner?.cells.length) {
        const main = owner.cells.reduce((max, c) => (c.mass > max.mass ? c : max), owner.cells[0]);
        emote.x = main.x;
        emote.y = main.y - main.radius - 22;
      }
    }
    this.activeEmotes = this.activeEmotes.filter(e => this.time - e.born < e.duration);

    // Bot AI reactive emotes
    if (this.time - this.lastBotEmoteCheck > 1.2) {
      this.lastBotEmoteCheck = this.time;
      for (const owner of this.owners) {
        if (owner.id === 0 || !owner.cells.length) continue;
        const brain = this.brains.get(owner.id);
        if (!brain) continue;
        if (brain.threatScore > 0.82 && owner.archetype === 'coward' && this.random() < 0.25) {
          this.triggerEmote('panic', owner.id);
        } else if (brain.lastAction === 'split' && owner.archetype === 'hunter' && this.random() < 0.3) {
          this.triggerEmote('devil', owner.id);
        }
      }
    }

    // Meteor shower dynamic event
    if (this.time >= this.nextMeteorTime - 5 && !this.meteorAlert) {
      const mx = this.coordinate(400);
      const my = this.coordinate(400);
      this.meteorAlert = { x: mx, y: my, radius: 320, active: true, timeRemaining: 5 };
      this.addNotice('☄️ CẢNH BÁO: MƯA SAO BĂNG SẮP RƠI XUỐNG ARENA!', true);
      arenaSound.play('royale_alarm');
    }
    if (this.meteorAlert) {
      this.meteorAlert.timeRemaining -= dt;
      if (this.meteorAlert.timeRemaining <= 0) {
        const mx = this.meteorAlert.x;
        const my = this.meteorAlert.y;
        arenaSound.play('meteor');
        for (let i = 0; i < 24; i++) {
          const angle = this.random() * Math.PI * 2;
          const r = this.random() * 260;
          this.addFood(clamp(mx + Math.cos(angle) * r, 20, WORLD - 20), clamp(my + Math.sin(angle) * r, 20, WORLD - 20));
        }
        this.burst(mx, my, '#ffd700', 30);
        this.burst(mx, my, '#00f2fe', 20);
        this.addNotice('🌟 MƯA SAO BĂNG ĐÃ ĐÁNH XUỐNG! NHẶT HẠT VÀNG NGAY!', true);
        this.meteorAlert = null;
        this.nextMeteorTime = this.time + BALANCE.meteorCooldown;
      }
    }

    // Boss Titan logic
    if (this.mode === 'boss') {
      const titan = this.ownerById(999);
      if (titan && titan.cells.length && titan.cells[0].alive) {
        const tCell = titan.cells[0];
        if (this.time >= this.bossShockwaveAt) {
          this.bossShockwaveAt = this.time + 4.8;
          arenaSound.play('titan_roar');
          this.burst(tCell.x, tCell.y, '#9333ea', 25);
          this.addFloater(tCell.x, tCell.y - tCell.radius, 'KRAKEN ROAR!', '#c084fc');
          for (const owner of this.owners) {
            if (owner.id === 999) continue;
            for (const cell of owner.cells) {
              const d = Math.hypot(cell.x - tCell.x, cell.y - tCell.y);
              if (d < tCell.radius + 300 && d > 1) {
                const push = (tCell.radius + 300 - d) * 0.75;
                const angle = Math.atan2(cell.y - tCell.y, cell.x - tCell.x);
                cell.vx += Math.cos(angle) * push;
                cell.vy += Math.sin(angle) * push;
              }
            }
          }
        }
        if (this.time >= this.bossSpikeAt) {
          this.bossSpikeAt = this.time + 7.5;
          for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2 + this.time;
            const sx = tCell.x + Math.cos(angle) * (tCell.radius + 15);
            const sy = tCell.y + Math.sin(angle) * (tCell.radius + 15);
            this.ejected.push({
              id: this.nextId++,
              x: sx,
              y: sy,
              color: '#a855f7',
              mass: 20,
              radius: massRadius(20),
              vx: Math.cos(angle) * 420,
              vy: Math.sin(angle) * 420,
              born: this.time,
              owner: 999,
              kind: 'gold',
            });
          }
        }
      } else if (!this.bossDefeated) {
        this.bossDefeated = true;
        arenaSound.play('achievement');
        this.addNotice('💥 KRAKEN TITAN ĐÃ BỊ TIÊU DIỆT! MƯA VÀNG BÙNG NỔ!', true);
        for (let i = 0; i < 60; i++) {
          const angle = this.random() * Math.PI * 2;
          const r = this.random() * 450;
          const f = this.addFood(clamp(WORLD / 2 + Math.cos(angle) * r, 20, WORLD - 20), clamp(WORLD / 2 + Math.sin(angle) * r, 20, WORLD - 20));
          f.kind = 'gold';
          f.color = '#ffd700';
          f.mass = 25;
        }
        this.burst(WORLD / 2, WORLD / 2, '#ffd700', 50);
      }
    }
    this.activeCellList.length = 0;
    for (let o = 0; o < this.owners.length; o++) {
      const oCells = this.owners[o].cells;
      for (let c = 0; c < oCells.length; c++) {
        if (oCells[c].alive) this.activeCellList.push(oCells[c]);
      }
    }
    const cells = this.activeCellList;
    this.ownerMap.clear();
    for (const owner of this.owners) this.ownerMap.set(owner.id, owner);
    for (const owner of this.owners) {
      if (this.mode !== 'royale' && owner.id !== 0 && !owner.cells.length && this.time >= owner.respawnAt) this.respawnBot(owner);
      if (!owner.cells.length) continue;
      if (owner.id === 0) this.updatePlayerTarget();
      else if (this.time >= owner.nextDecision) this.decide(owner, cells);
      this.steerBot(owner, dt);
      this.moveOwner(owner, dt);
      this.recombine(owner, dt);
      if (owner.id !== 0) this.trackBot(owner, dt);
    }
    this.sampleAi();
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
    this.stepTimeMs += performance.now() - started;
    this.stepCount++;
  }

  /** Spawn scoring: prefer low-density areas far from giants and viruses. */
  private pickSpawn(): { x: number; y: number } {
    let best = { x: this.coordinate(160), y: this.coordinate(160) };
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = this.coordinate(160);
      const y = this.coordinate(160);
      let score = this.random() * 20;
      const edge = Math.min(x, y, WORLD - x, WORLD - y);
      if (edge < 300) score -= (300 - edge) / 8;
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


  private seedBrains() {
    for (const owner of this.owners) {
      if (owner.id === 0 || !owner.cells.length) continue;
      const cell = owner.cells[0];
      this.brains.set(owner.id, createBrain(owner.id, cell.x, cell.y, this.time, owner.archetype));
    }
  }

  private brainFor(owner: Organism): BotBrain {
    let brain = this.brains.get(owner.id);
    if (!brain) {
      const cell = owner.cells[0];
      brain = createBrain(owner.id, cell?.x ?? WORLD / 2, cell?.y ?? WORLD / 2, this.time, owner.archetype);
      this.brains.set(owner.id, brain);
    }
    return brain;
  }

  private respawnBot(owner: Organism) {
    const spawn = this.pickSpawn();
    owner.cells = [this.makeCell(owner.id, spawn.x, spawn.y, BALANCE.botMinMass + this.random() * 95)];
    owner.protectedUntil = this.time + BALANCE.botProtection;
    owner.targetX = spawn.x;
    owner.targetY = spawn.y;
    owner.nextDecision = this.time;
    const brain = this.brains.get(owner.id);
    if (brain) onRespawn(brain, spawn.x, spawn.y, this.time);
  }

  /**
   * Strategic tick. The mind returns an aim point and optional actions;
   * physics applies them. Perception stays local — no full-map entity list.
   */
  private decide(owner: Organism, cells: Cell[]) {
    const decisionStarted = performance.now();
    const brain = this.brainFor(owner);
    const focusX = this.phase === 'spectating' ? this.camera.x : (this.player.cells[0]?.x ?? this.camera.x);
    const focusY = this.phase === 'spectating' ? this.camera.y : (this.player.cells[0]?.y ?? this.camera.y);
    const main = owner.cells.reduce((a, b) => a.mass > b.mass ? a : b);
    const reach = AI.perception.max;
    const oCells = owner.cells;
    const isSingle = oCells.length === 1;
    const m0 = oCells[0];
    let minX = m0.x - reach;
    let maxX = m0.x + reach;
    let minY = m0.y - reach;
    let maxY = m0.y + reach;
    if (!isSingle) {
      for (let i = 1; i < oCells.length; i++) {
        const c = oCells[i];
        if (c.x - reach < minX) minX = c.x - reach;
        if (c.x + reach > maxX) maxX = c.x + reach;
        if (c.y - reach < minY) minY = c.y - reach;
        if (c.y + reach > maxY) maxY = c.y + reach;
      }
    }

    this.visibleCellsBuffer.length = 0;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.owner === owner.id) {
        this.visibleCellsBuffer.push(cell);
        continue;
      }
      if (cell.x < minX || cell.x > maxX || cell.y < minY || cell.y > maxY) continue;
      if (isSingle) {
        this.visibleCellsBuffer.push(cell);
      } else {
        for (let j = 0; j < oCells.length; j++) {
          const mine = oCells[j];
          if (Math.abs(cell.x - mine.x) <= reach && Math.abs(cell.y - mine.y) <= reach) {
            this.visibleCellsBuffer.push(cell);
            break;
          }
        }
      }
    }

    this.visibleVirusesBuffer.length = 0;
    for (let i = 0; i < this.viruses.length; i++) {
      const virus = this.viruses[i];
      if (virus.x < minX || virus.x > maxX || virus.y < minY || virus.y > maxY) continue;
      if (isSingle) {
        this.visibleVirusesBuffer.push(virus);
      } else {
        for (let j = 0; j < oCells.length; j++) {
          const mine = oCells[j];
          if (Math.abs(virus.x - mine.x) <= reach && Math.abs(virus.y - mine.y) <= reach) {
            this.visibleVirusesBuffer.push(virus);
            break;
          }
        }
      }
    }

    this.visibleEjectedBuffer.length = 0;
    const pelletReach = AI.performance.foodRadius + 80;
    let pMinX = m0.x - pelletReach;
    let pMaxX = m0.x + pelletReach;
    let pMinY = m0.y - pelletReach;
    let pMaxY = m0.y + pelletReach;
    if (!isSingle) {
      for (let i = 1; i < oCells.length; i++) {
        const c = oCells[i];
        if (c.x - pelletReach < pMinX) pMinX = c.x - pelletReach;
        if (c.x + pelletReach > pMaxX) pMaxX = c.x + pelletReach;
        if (c.y - pelletReach < pMinY) pMinY = c.y - pelletReach;
        if (c.y + pelletReach > pMaxY) pMaxY = c.y + pelletReach;
      }
    }

    for (let i = 0; i < this.ejected.length; i++) {
      const mass = this.ejected[i];
      if (mass.mass <= 0) continue;
      if (mass.x < pMinX || mass.x > pMaxX || mass.y < pMinY || mass.y > pMaxY) continue;
      if (isSingle) {
        this.visibleEjectedBuffer.push(mass);
      } else {
        for (let j = 0; j < oCells.length; j++) {
          const mine = oCells[j];
          if (Math.abs(mass.x - mine.x) <= pelletReach && Math.abs(mass.y - mine.y) <= pelletReach) {
            this.visibleEjectedBuffer.push(mass);
            break;
          }
        }
      }
    }

    const decision = think({
      time: this.time,
      world: WORLD,
      mode: this.mode,
      owner,
      cells: this.visibleCellsBuffer,
      viruses: this.visibleVirusesBuffer,
      ejected: this.visibleEjectedBuffer,
      foodNear: (x, y, radius) => this.index.near(x, y, radius),
      ownerOf: id => this.ownerMap.get(id),
      random: () => this.random(),
      brain,
      focusDist: Math.hypot(main.x - focusX, main.y - focusY),
    });
    const previous = brain.strategy;
    if (decision.strategy !== previous) {
      brain.since = this.time;
      brain.switches++;
      brain.massAtStrategy = owner.cells.reduce((sum, cell) => sum + cell.mass, 0);
      this.aiTotals.switches++;
    }
    brain.strategy = decision.strategy;
    brain.desiredX = decision.x;
    brain.desiredY = decision.y;
    brain.urgent = decision.urgent;
    brain.perception = decision.perception;
    brain.threatScore = decision.threat;
    brain.huntScore = decision.hunt;
    brain.farmScore = decision.farm;
    brain.fleeScore = decision.flee;
    brain.lastThreat = decision.threat;
    brain.lastWall = decision.wall;
    brain.note = decision.note;
    brain.lastAction = decision.strategy;
    brain.lastActionAt = this.time;
    brain.situation = decision.situation;
    brain.strategyConfidence = decision.confidence;
    brain.timeToIntercept = decision.timeToIntercept;
    brain.huntProbability = decision.huntProbability;
    brain.escapeQuality = decision.escapeQuality;
    brain.crowdingLevel = decision.crowding;
    brain.opportunityLevel = decision.opportunity;
    owner.nextDecision = this.time + decision.interval;
    if (decision.split) {
      const didSplit = this.splitOwner(owner, decision.angle, true);
      if (didSplit) {
        brain.lastAction = 'split';
        brain.lastActionAt = this.time;
        brain.lastSplitAt = this.time;
        brain.lastSplitRisky = decision.splitRisky;
        brain.vulnerableUntil = this.time + 1.7;
        brain.finishUntil = this.time + 0.9;
        this.aiTotals.splits++;
        recordOutcome(brain, this.aiTotals, 'split_success', this.time, brain.targetOwnerId);
      } else {
        recordOutcome(brain, this.aiTotals, 'split_failure', this.time, brain.targetOwnerId);
      }
    } else if (decision.eject && this.time >= brain.ejectAt && this.ejectOwner(owner, decision.ejectAngle, false)) {
      brain.lastAction = 'eject';
      brain.lastActionAt = this.time;
      brain.ejectAt = this.time + BALANCE.ejectCooldown;
      this.aiTotals.ejects++;
      if (decision.ejectKind === 'feed') this.aiTotals.virusFeeds++;
    }
    const surviving = decision.strategy === 'flee' || decision.strategy === 'bait';
    const wasSurviving = previous === 'flee' || previous === 'bait';
    if (surviving && !wasSurviving && decision.urgent) this.aiTotals.escapeAttempts++;
    if (wasSurviving && !surviving && decision.threat < 0.55) recordOutcome(brain, this.aiTotals, 'escape_success', this.time);
    const hunting = decision.strategy === 'hunt' || decision.strategy === 'stalk';
    const wasHunting = previous === 'hunt' || previous === 'stalk';
    if (hunting && !wasHunting) this.aiTotals.hunts++;
    if (decision.abandoned) recordOutcome(brain, this.aiTotals, 'hunt_failure', this.time, brain.abandonOwner);
    if (decision.baited && previous !== 'bait') this.aiTotals.virusBaits++;
    if (decision.oscillated) this.aiTotals.oscillations++;
    const elapsed = performance.now() - decisionStarted;
    this.aiTimeMs += elapsed;
    this.aiDecisions++;
    this.aiSlowestMs = Math.max(this.aiSlowestMs, elapsed);
    this.aiTotals.decisions++;
    this.aiTotals.decisionQualitySum += decision.confidence * (decision.urgent ? 0.92 : 1);
    this.aiTotals.decisionQualitySamples++;
  }

  /** Ease the aim point so bots don't snap 180° every think. Players stay direct. */
  private steerBot(owner: Organism, dt: number) {
    if (owner.id === 0) return;
    const brain = this.brains.get(owner.id);
    if (!brain) return;
    const rate = brain.urgent ? AI.movement.aimUrgent : AI.movement.aimRate;
    const blend = 1 - Math.exp(-rate * dt);
    if (!brain.aimed) {
      brain.aimX = brain.desiredX;
      brain.aimY = brain.desiredY;
      brain.aimed = true;
    } else {
      brain.aimX += (brain.desiredX - brain.aimX) * blend;
      brain.aimY += (brain.desiredY - brain.aimY) * blend;
    }
    owner.targetX = clamp(brain.aimX, 24, WORLD - 24);
    owner.targetY = clamp(brain.aimY, 24, WORLD - 24);
  }

  private trackBot(owner: Organism, dt: number) {
    const brain = this.brains.get(owner.id);
    if (!brain) return;
    this.aiTotals.stateTime[brain.strategy] += dt;
    const mass = owner.cells.reduce((sum, cell) => sum + cell.mass, 0);
    if (mass > brain.peakMass) brain.peakMass = mass;
    if (mass > this.aiTotals.maxMass) this.aiTotals.maxMass = mass;
  }

  private sampleAi() {
    if (this.time < this.aiTotals.sampleAt) return;
    this.aiTotals.sampleAt = this.time + 1;
    for (const owner of this.owners) {
      if (owner.id === 0 || !owner.cells.length) continue;
      const mass = owner.cells.reduce((sum, cell) => sum + cell.mass, 0);
      this.aiTotals.massSum += mass;
      this.aiTotals.massSamples++;
      if (mass > this.aiTotals.maxMass) this.aiTotals.maxMass = mass;
    }
  }

  private dropOwner(owner: Organism) {
    const hadCells = owner.cells.length > 0;
    owner.cells = owner.cells.filter(cell => cell.alive);
    if (hadCells && !owner.cells.length) {
      owner.respawnAt = this.time + BALANCE.respawnDelay;
      if (owner.id !== 0) recordDeath(this.brains.get(owner.id), this.aiTotals, this.time);
    }
  }

  aiReport(): AiReport {
    return buildReport(this.aiTotals, this.owners, this.brains, this.time);
  }

  aiDebugMarks(): AiMark[] {
    if (!this.aiDebug) return AgarEngine.NO_MARKS;
    const marks: AiMark[] = [];
    for (const owner of this.owners) {
      if (owner.id === 0 || !owner.cells.length) continue;
      const brain = this.brains.get(owner.id);
      if (!brain) continue;
      let x = 0;
      let y = 0;
      let mass = 0;
      for (const cell of owner.cells) {
        x += cell.x * cell.mass;
        y += cell.y * cell.mass;
        mass += cell.mass;
      }
      x /= mass;
      y /= mass;
      if (Math.hypot(x - this.camera.x, y - this.camera.y) > 980) continue;
      marks.push({
        x, y, tx: brain.desiredX, ty: brain.desiredY,
        interceptX: brain.interceptX, interceptY: brain.interceptY,
        escapeX: brain.targetEscapeX, escapeY: brain.targetEscapeY,
        strategy: brain.strategy, situation: brain.situation,
        perception: brain.perception, confidence: brain.strategyConfidence,
        targetScore: brain.targetScore, threat: brain.threatScore,
        huntProbability: brain.huntProbability, timeToIntercept: brain.timeToIntercept,
        escapeQuality: brain.escapeQuality, note: brain.note,
      });
      if (marks.length >= 12) break;
    }
    return marks;
  }

  private moveOwner(owner: Organism, dt: number) {
    const impulseDecayFactor = Math.exp(-BALANCE.impulseDecay * dt);
    for (const cell of owner.cells) {
      if (!cell.alive) continue;
      cell.lx = cell.x;
      cell.ly = cell.y;
      const dx = owner.targetX - cell.x;
      const dy = owner.targetY - cell.y;
      const length = Math.hypot(dx, dy);
      let speed = cellSpeed(cell.mass);
      if (this.mode === 'turbo') speed *= 1.35;
      if (owner.id === 0 && this.time < this.speedBoostUntil) speed *= 1.35;
      const slow = Math.min(1, length / Math.max(25, cell.radius * 0.65));
      if (length > 1) {
        cell.x += dx / length * speed * slow * dt;
        cell.y += dy / length * speed * slow * dt;
      }
      cell.x += cell.vx * dt;
      cell.y += cell.vy * dt;
      cell.vx *= impulseDecayFactor;
      cell.vy *= impulseDecayFactor;
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
    if (owner.cells.length <= 1) return;
    let deadCount = 0;
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
            deadCount++;
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
    if (deadCount > 0) {
      owner.cells = owner.cells.filter(cell => cell.alive);
    }
  }

  split(): boolean {
    if (this.phase !== 'playing' || this.paused) return false;
    const angle = Math.atan2(this.pointer.y, this.pointer.x);
    const result = this.splitOwner(this.player, angle);
    if (result) arenaSound.play('split');
    else arenaSound.play('denied');
    return result;
  }

  private splitOwner(owner: Organism, angle: number, onlyLargest = false): boolean {
    const original = [...owner.cells].sort((a, b) => b.mass - a.mass);
    const targets = onlyLargest ? original.slice(0, 1) : original;
    let didSplit = false;
    for (const cell of targets) {
      if (owner.cells.length >= BALANCE.maxFragments) break;
      if (cell.mass < BALANCE.minSplitMass) continue;
      // Split conserves mass exactly: two halves equal the whole.
      cell.mass /= 2;
      const radius = massRadius(cell.mass);
      const newCell = this.makeCell(owner.id, cell.x + Math.cos(angle) * radius, cell.y + Math.sin(angle) * radius, cell.mass);
      newCell.radius = radius * 0.7;
      const impulse = this.mode === 'turbo' ? BALANCE.splitImpulse * 1.2 : BALANCE.splitImpulse;
      newCell.vx = Math.cos(angle) * impulse;
      newCell.vy = Math.sin(angle) * impulse;
      const delay = this.mode === 'turbo' ? mergeDelay(cell.mass) * 0.6 : mergeDelay(cell.mass);
      cell.mergeAt = newCell.mergeAt = this.time + delay;
      owner.cells.push(newCell);
      didSplit = true;
    }
    if (didSplit) owner.splitAt = this.time + (onlyLargest ? AI.split.cooldown : BALANCE.splitCooldown);
    return didSplit;
  }

  eject(): boolean {
    if (this.phase !== 'playing' || this.paused || this.time < this.ejectAt) return false;
    const didEject = this.ejectOwner(this.player, null, true);
    this.ejectAt = this.time + BALANCE.ejectCooldown;
    if (didEject) arenaSound.play('eject');
    return didEject;
  }

  private ejectOwner(owner: Organism, angle: number | null, fromAll: boolean): boolean {
    let didEject = false;
    const cells = fromAll ? owner.cells : [...owner.cells].sort((a, b) => b.mass - a.mass).slice(0, 1);
    for (const cell of cells) {
      if (cell.mass < BALANCE.minEjectMass) continue;
      if (this.ejected.length >= BALANCE.maxEjected) {
        this.ejected.sort((a, b) => a.born - b.born);
        this.ejected.shift();
      }
      const aim = angle ?? Math.atan2(owner.targetY - cell.y, owner.targetX - cell.x);
      const radius = massRadius(cell.mass);
      this.ejected.push({
        id: this.nextId++,
        x: cell.x + Math.cos(aim) * (radius + 14), y: cell.y + Math.sin(aim) * (radius + 14),
        vx: Math.cos(aim) * BALANCE.ejectImpulse, vy: Math.sin(aim) * BALANCE.ejectImpulse,
        color: owner.color, mass: BALANCE.ejectMass, radius: 9, born: this.time, owner: owner.id,
      });
      cell.mass -= BALANCE.ejectCost;
      didEject = true;
      if (!fromAll) break;
    }
    return didEject;
  }

  private updateEjected(dt: number) {
    if (this.ejected.length === 0) return;
    const ejectDecayFactor = Math.exp(-BALANCE.ejectDecay * dt);
    for (let i = 0; i < this.ejected.length; i++) {
      const mass = this.ejected[i];
      mass.x = clamp(mass.x + mass.vx * dt, 10, WORLD - 10);
      mass.y = clamp(mass.y + mass.vy * dt, 10, WORLD - 10);
      mass.vx *= ejectDecayFactor;
      mass.vy *= ejectDecayFactor;
    }
    this.ejected = this.ejected.filter(mass => this.time - mass.born < BALANCE.ejectLifetime && mass.mass > 0);
    // Hard cap so eject spam can never grow memory or collision cost unboundedly.
    if (this.ejected.length > BALANCE.maxEjected) {
      this.ejected.sort((a, b) => a.born - b.born);
      this.ejected.splice(0, this.ejected.length - BALANCE.maxEjected);
    }
  }

  private consumeFood() {
    for (let o = 0; o < this.owners.length; o++) {
      const owner = this.owners[o];
      const oCells = owner.cells;
      for (let c = 0; c < oCells.length; c++) {
        const cell = oCells[c];
        if (!cell.alive) continue;
        const cellR = cell.radius;
        const rSq = cellR * cellR;
        this.eatenFoodScratch.length = 0;
        this.index.forEachNear(cell.x, cell.y, cellR + 7, (food) => {
          const dx = cell.x - food.x;
          const dy = cell.y - food.y;
          if (dx * dx + dy * dy <= rSq) {
            this.eatenFoodScratch.push(food);
          }
        });

        for (let i = 0; i < this.eatenFoodScratch.length; i++) {
          const food = this.eatenFoodScratch[i];
          if (food.kind === 'gold') {
            cell.mass += 25;
            cell.pulse = 1;
            if (owner.id === 0) {
              this.stats.food += 5;
              this.burst(food.x, food.y, '#ffd700', 8);
              this.addFloater(food.x, food.y - food.radius, '+25 VÀNG!', '#ffd700');
              arenaSound.play('powerup');
            }
          } else if (food.kind === 'speed') {
            cell.mass += 12;
            cell.pulse = 1;
            if (owner.id === 0) {
              this.speedBoostUntil = this.time + 4;
              this.burst(food.x, food.y, '#00f2fe', 8);
              this.addFloater(food.x, food.y - food.radius, 'TĂNG TỐC!', '#00f2fe');
              arenaSound.play('powerup');
            }
          } else {
            cell.mass += food.mass;
            cell.pulse = Math.min(1, cell.pulse + 0.25);
            if (owner.id === 0) {
              this.stats.food++;
              this.burst(food.x, food.y, food.color, 2);
              arenaSound.play('eat');
            }
          }
          if (owner.id !== 0) {
            this.aiTotals.foodEaten++;
            const brain = this.brains.get(owner.id);
            if (brain) {
              brain.foodEaten++;
              if (this.time - brain.lastOutcomeAt > 0.6) recordOutcome(brain, this.aiTotals, 'safe_farm', this.time);
            }
          }
          this.resetFood(food);
        }

        if (this.ejected.length > 0) {
          const eatR = cellR - 3;
          const eatRSq = eatR * eatR;
          for (let i = 0; i < this.ejected.length; i++) {
            const mass = this.ejected[i];
            if (mass.mass <= 0 || this.time - mass.born < BALANCE.ejectPickupDelay || cell.mass < mass.mass * BALANCE.ejectEatRatio) continue;
            const dx = cell.x - mass.x;
            const dy = cell.y - mass.y;
            if (dx * dx + dy * dy < eatRSq) {
              cell.mass += mass.mass;
              cell.pulse = 1;
              mass.mass = 0;
            }
          }
        }
      }
    }
  }

  private consumeCells() {
    this.cellBuffer.length = 0;
    for (let o = 0; o < this.owners.length; o++) {
      const oCells = this.owners[o].cells;
      for (let c = 0; c < oCells.length; c++) {
        if (oCells[c].alive) this.cellBuffer.push(oCells[c]);
      }
    }
    this.cellBuffer.sort((a, b) => b.mass - a.mass || a.id - b.id);
    const cells = this.cellBuffer;
    for (let i = 0; i < cells.length; i++) {
      const big = cells[i];
      if (!big.alive) continue;
      const bigR = big.radius;
      for (let j = i + 1; j < cells.length; j++) {
        const small = cells[j];
        if (!small.alive || big.owner === small.owner || big.mass < small.mass * BALANCE.eatRatio) continue;
        const dx = small.x - big.x;
        const dy = small.y - big.y;
        if (Math.abs(dx) > bigR || Math.abs(dy) > bigR) continue;
        const bigOwner = this.ownerById(big.owner);
        const smallOwner = this.ownerById(small.owner);
        if (!bigOwner || !smallOwner) continue;
        if (this.mode === 'teams' && bigOwner.team === smallOwner.team) continue;
        if (smallOwner.protectedUntil > this.time || bigOwner.protectedUntil > this.time) continue;
        const maxDist = bigR - small.radius * BALANCE.eatOverlapFactor;
        if (maxDist <= 0 || dx * dx + dy * dy > maxDist * maxDist) continue;
        big.mass += small.mass;
        big.pulse = 1;
        small.alive = false;
        if (big.owner === 0) {
          this.stats.cells++;
          if (this.player.cells.length > 1) this.stats.splitEats++;
          arenaSound.play('pop');
          this.addFloater(small.x, small.y, `+${Math.round(small.mass)}`, '#ffffff');

          if (this.time - this.lastKillTime < 4.5) {
            this.killStreak++;
            if (this.killStreak === 2) {
              this.addNotice('🔥 DOUBLE KILL!', true);
              arenaSound.play('combo');
            } else if (this.killStreak === 3) {
              this.addNotice('⚡ TRIPLE KILL!', true);
              arenaSound.play('combo');
            } else if (this.killStreak >= 4) {
              this.addNotice(`👑 MEGA KILL x${this.killStreak}!`, true);
              arenaSound.play('combo');
            }
          } else {
            this.killStreak = 1;
            this.addNotice(`Bạn đã nuốt chửng ${smallOwner.name} (+${Math.round(small.mass)})`);
          }
          this.lastKillTime = this.time;
        }
        if (small.owner === 0) {
          this.stats.eatenBy = bigOwner.name;
          this.addNotice(`${bigOwner.name} đã nuốt chửng bạn!`, true);
        }
        if (big.owner !== 0) {
          this.aiTotals.preyEaten++;
          const brain = this.brains.get(big.owner);
          if (brain && brain.targetCellId === small.id) {
            recordOutcome(brain, this.aiTotals, 'hunt_success', this.time, small.owner);
            brain.targetCellId = 0;
          } else if (brain) {
            recordOutcome(brain, this.aiTotals, 'opportunistic_eat', this.time, small.owner);
          }
        }
        this.burst(small.x, small.y, smallOwner.color, 7);
      }
    }
    for (const owner of this.owners) this.dropOwner(owner);
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
        this.dropOwner(owner);
      }
    }
  }

  private explode(owner: Organism, cell: Cell, bonus: number) {
    if (owner.id !== 0) recordVirusPop(this.brains.get(owner.id), this.aiTotals, this.time);

    // Authentic Agar.io mechanic: Cell always gains the virus bonus mass first
    cell.mass += bonus;
    const currentTotalMass = cell.mass;

    // Maximum fragments in Agar.io is 16
    const availableSlots = BALANCE.maxFragments - owner.cells.length;

    // Authentic Agar.io "16-Cell Virus Eat" (Virus Farming):
    // When a player already has 16 cells, hitting a virus does NOT punish or burn mass!
    // Instead, the cell absorbs the virus mass safely without splitting further.
    if (availableSlots <= 0) {
      cell.pulse = 1.25;
      if (owner.id === 0) {
        arenaSound.play('virus');
        this.addFloater(cell.x, cell.y - cell.radius, `+${Math.round(bonus)} Ăn Virus!`, '#22c55e');
      }
      this.burst(cell.x, cell.y, '#4ade80', 16);
      return;
    }

    // Determine how many fragments to create based on mass and available player slots
    const maxPiecesFromMass = Math.floor(currentTotalMass / BALANCE.virusMinBurstMass);
    const piecesToSpawn = Math.min(availableSlots, Math.max(1, maxPiecesFromMass - 1));
    const totalPieces = piecesToSpawn + 1;

    // Absolute mass conservation: divide total mass evenly among all pieces
    const pieceMass = currentTotalMass / totalPieces;
    cell.mass = pieceMass;
    cell.radius = massRadius(pieceMass);
    cell.pulse = 1.35;
    cell.mergeAt = this.time + mergeDelay(pieceMass);

    // Realistic radial starburst dispersion with angular jitter & parent recoil
    const baseAngle = this.random() * Math.PI * 2;
    const parentVx = cell.vx;
    const parentVy = cell.vy;

    // Parent cell recoil from explosive burst
    cell.vx = parentVx * 0.2 - Math.cos(baseAngle) * 120;
    cell.vy = parentVy * 0.2 - Math.sin(baseAngle) * 120;

    for (let i = 0; i < piecesToSpawn; i++) {
      const angleFraction = i / piecesToSpawn;
      const jitter = (this.random() - 0.5) * 0.32;
      const angle = baseAngle + angleFraction * Math.PI * 2 + jitter;

      const spawnDist = Math.max(10, cell.radius * 0.45);
      const spawnX = clamp(cell.x + Math.cos(angle) * spawnDist, 20, WORLD - 20);
      const spawnY = clamp(cell.y + Math.sin(angle) * spawnDist, 20, WORLD - 20);

      const piece = this.makeCell(owner.id, spawnX, spawnY, pieceMass);
      piece.radius = massRadius(pieceMass) * 0.65;
      piece.pulse = 1.15;

      // Authentic split impulse with momentum inheritance (750 - 990 px/s)
      const burstImpulse = (BALANCE.splitImpulse * 0.95) + (this.random() * 240);
      piece.vx = Math.cos(angle) * burstImpulse + parentVx * 0.35;
      piece.vy = Math.sin(angle) * burstImpulse + parentVy * 0.35;

      // Dynamic remerge delay based on individual piece mass
      piece.mergeAt = this.time + mergeDelay(pieceMass);
      owner.cells.push(piece);
    }

    // Authentic viral debris and pulse animations
    this.burst(cell.x, cell.y, '#7ee787', 22);
    this.burst(cell.x, cell.y, owner.color, 12);
    if (owner.id === 0) {
      arenaSound.play('virus');
      this.addFloater(cell.x, cell.y - cell.radius, 'Virus Nổ Tung!', '#9bcf78');
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
      aiTimeMs: this.aiTimeMs,
      aiDecisions: this.aiDecisions,
      aiAverageMs: this.aiDecisions ? this.aiTimeMs / this.aiDecisions : 0,
      aiSlowestMs: this.aiSlowestMs,
      stepAverageMs: this.stepCount ? this.stepTimeMs / this.stepCount : 0,
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
      royaleRadius: this.mode === 'royale' ? this.royaleRadius : undefined,
      royaleCenter: this.mode === 'royale' ? { x: WORLD / 2, y: WORLD / 2 } : undefined,
      speedBoostRemaining: Math.max(0, this.speedBoostUntil - this.time),
      combatNotices: [...this.combatNotices],
      streak: this.killStreak,
      royaleWinner: this.royaleWinner,
      boss: this.mode === 'boss' ? {
        name: 'KRAKEN TITAN',
        mass: Math.round(this.ownerById(999)?.cells[0]?.mass ?? 0),
        maxMass: BALANCE.bossMaxMass,
        x: this.ownerById(999)?.cells[0]?.x ?? WORLD / 2,
        y: this.ownerById(999)?.cells[0]?.y ?? WORLD / 2,
        alive: (this.ownerById(999)?.cells[0]?.mass ?? 0) > 0,
      } : undefined,
      meteorAlert: this.meteorAlert ? { ...this.meteorAlert } : undefined,
      activeEmotes: this.activeEmotes.slice(),
    };
  }
}
