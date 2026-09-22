/**
 * Bot mind. Perception and scoring live here; the engine only applies the
 * chosen aim point, split, and eject. Bots never receive positions outside
 * their perception radius, and they do not get extra speed or mass.
 *
 * Layers: perceive → score utilities → commit a strategy (with hysteresis)
 * → pick a point. Movement steering stays in the engine.
 */
import { AI, AI_PERSONALITY, BALANCE, cellSpeed, impulseTravel, massRadius, type Personality } from './config';
import type {
  AiArchetype, AiStrategy, Cell, EjectedMass, Food, GameMode, Organism, Virus,
} from './types';

const TAU = Math.PI * 2;
const STEP_RATE = 1 / BALANCE.fixedStep;

const STRATEGIES: AiStrategy[] = ['flee', 'bait', 'hunt', 'stalk', 'farm', 'explore', 'recover', 'reposition'];

const MIN_DURATION: Record<AiStrategy, number> = {
  flee: AI.flee.minDuration,
  bait: 0.55,
  hunt: AI.hunt.minDuration,
  stalk: 0.7,
  farm: AI.farm.minDuration,
  explore: 0.85,
  recover: 0.9,
  reposition: 0.42,
};

export interface BotLessons {
  boundary: number;
  chase: number;
  virus: number;
  split: number;
}

export interface BotBrain {
  strategy: AiStrategy;
  since: number;
  lockUntil: number;
  switchTimes: number[];
  oscillations: number;
  switches: number;
  targetCellId: number;
  targetOwnerId: number;
  chaseSince: number;
  lastProgressAt: number;
  bestChaseDist: number;
  abandonOwner: number;
  abandonUntil: number;
  desiredX: number;
  desiredY: number;
  aimX: number;
  aimY: number;
  aimed: boolean;
  urgent: boolean;
  perception: number;
  foodX: number;
  foodY: number;
  foodUntil: number;
  foodScore: number;
  anchorX: number;
  anchorY: number;
  anchorAt: number;
  homeX: number;
  homeY: number;
  pendingThreatId: number;
  pendingThreatAt: number;
  threatLatchedAt: number;
  reaction: number;
  vulnerableUntil: number;
  finishUntil: number;
  lastSplitAt: number;
  lastSplitRisky: boolean;
  ejectAt: number;
  spawnCautionUntil: number;
  bornAt: number;
  peakMass: number;
  lastThreat: number;
  lastWall: number;
  massAtStrategy: number;
  lessons: BotLessons;
  risk: number;
  foodBias: number;
  splitBias: number;
  perceptionMul: number;
  sideSign: number;
  hunts: number;
  foodEaten: number;
  kills: number;
  threatScore: number;
  huntScore: number;
  farmScore: number;
  fleeScore: number;
  note: string;
  avoidX: number;
  avoidY: number;
  avoidUntil: number;
}

export interface AiTotals {
  deaths: number;
  avoidableDeaths: number;
  foodEaten: number;
  preyEaten: number;
  hunts: number;
  huntsWon: number;
  huntsFailed: number;
  escapes: number;
  escapeAttempts: number;
  splits: number;
  badSplits: number;
  ejects: number;
  virusBaits: number;
  virusFeeds: number;
  virusPops: number;
  switches: number;
  oscillations: number;
  lifetimes: number[];
  massSamples: number;
  massSum: number;
  maxMass: number;
  stateTime: Record<AiStrategy, number>;
  sampleAt: number;
}

export interface AiReport {
  seconds: number;
  alive: number;
  deaths: number;
  avoidableDeaths: number;
  avoidableRate: number;
  foodEaten: number;
  preyEaten: number;
  hunts: number;
  huntsWon: number;
  huntsFailed: number;
  huntSuccess: number;
  escapes: number;
  escapeAttempts: number;
  splits: number;
  ejects: number;
  virusBaits: number;
  virusFeeds: number;
  virusPops: number;
  switches: number;
  oscillations: number;
  averageMass: number;
  currentAverageMass: number;
  maxMass: number;
  medianLifetime: number;
  meanLifetime: number;
  stateCounts: Record<AiStrategy, number>;
  stateTime: Record<AiStrategy, number>;
  stateShare: Record<AiStrategy, number>;
}

export interface AiMark {
  x: number;
  y: number;
  tx: number;
  ty: number;
  strategy: AiStrategy;
  perception: number;
  note: string;
}

export interface ThreatInfo {
  id: number;
  ownerId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  dist: number;
  score: number;
  closing: number;
  canEat: boolean;
  splitKill: boolean;
  gap: number;
}

export interface PreyChoice {
  id: number;
  ownerId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  dist: number;
  score: number;
  aimX: number;
  aimY: number;
  freeKill: boolean;
  canSplit: boolean;
}

export interface Decision {
  strategy: AiStrategy;
  x: number;
  y: number;
  urgent: boolean;
  split: boolean;
  angle: number;
  splitRisky: boolean;
  eject: boolean;
  ejectAngle: number;
  ejectKind: 'feed' | 'none';
  interval: number;
  perception: number;
  threat: number;
  hunt: number;
  farm: number;
  flee: number;
  wall: number;
  note: string;
  abandoned: boolean;
  baited: boolean;
  oscillated: boolean;
  threatId: number;
}

export interface ThinkInput {
  time: number;
  world: number;
  mode: GameMode;
  owner: Organism;
  cells: Cell[];
  viruses: Virus[];
  ejected: EjectedMass[];
  foodNear: (x: number, y: number, radius: number) => Iterable<Food>;
  ownerOf: (id: number) => Organism | undefined;
  random: () => number;
  brain: BotBrain;
  focusDist: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const hypot = Math.hypot;

function unitHash(n: number): number {
  let x = Math.imul(n | 0, 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 13), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % TAU;
  if (d > Math.PI) d = TAU - d;
  return d;
}

function family(strategy: AiStrategy): 'survive' | 'aggro' | 'grow' {
  if (strategy === 'flee' || strategy === 'bait') return 'survive';
  if (strategy === 'hunt' || strategy === 'stalk') return 'aggro';
  return 'grow';
}

export function personalityOf(archetype: AiArchetype): Personality {
  return AI_PERSONALITY[archetype] ?? AI_PERSONALITY.opportunist;
}

export function boundaryDanger(x: number, y: number, world: number, margin: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y) || margin <= 0) return 0;
  const edge = Math.min(x, y, world - x, world - y);
  if (edge >= margin) return 0;
  return clamp((margin - edge) / margin, 0, 1);
}

function emptyStateTime(): Record<AiStrategy, number> {
  return { farm: 0, explore: 0, hunt: 0, stalk: 0, flee: 0, bait: 0, recover: 0, reposition: 0 };
}

export function createBrain(ownerId: number, x: number, y: number, time: number, archetype: AiArchetype): BotBrain {
  const personality = personalityOf(archetype);
  const h = (salt: number) => unitHash(ownerId * 10007 + salt * 97);
  return {
    strategy: 'farm',
    since: time - 10,
    lockUntil: 0,
    switchTimes: [],
    oscillations: 0,
    switches: 0,
    targetCellId: 0,
    targetOwnerId: 0,
    chaseSince: time,
    lastProgressAt: time,
    bestChaseDist: Infinity,
    abandonOwner: 0,
    abandonUntil: 0,
    desiredX: x,
    desiredY: y,
    aimX: x,
    aimY: y,
    aimed: false,
    urgent: false,
    perception: AI.perception.base,
    foodX: x,
    foodY: y,
    foodUntil: 0,
    foodScore: 0,
    anchorX: x,
    anchorY: y,
    anchorAt: time,
    homeX: x,
    homeY: y,
    pendingThreatId: 0,
    pendingThreatAt: 0,
    threatLatchedAt: 0,
    reaction: AI.perception.reactionBase * personality.reaction * (0.82 + h(1) * 0.4),
    vulnerableUntil: 0,
    finishUntil: 0,
    lastSplitAt: -99,
    lastSplitRisky: false,
    ejectAt: 0,
    spawnCautionUntil: time + AI.memory.spawnCaution,
    bornAt: time,
    peakMass: 0,
    lastThreat: 0,
    lastWall: 0,
    massAtStrategy: 0,
    lessons: { boundary: 0, chase: 1, virus: 0, split: 0 },
    risk: personality.risk * (0.88 + h(2) * 0.24),
    foodBias: 0.9 + h(3) * 0.22,
    splitBias: 0.86 + h(4) * 0.28,
    perceptionMul: personality.perception * (0.92 + h(5) * 0.16),
    sideSign: h(6) < 0.5 ? -1 : 1,
    hunts: 0,
    foodEaten: 0,
    kills: 0,
    threatScore: 0,
    huntScore: 0,
    farmScore: 0,
    fleeScore: 0,
    note: 'farm',
    avoidX: x,
    avoidY: y,
    avoidUntil: 0,
  };
}

export function createTotals(): AiTotals {
  return {
    deaths: 0,
    avoidableDeaths: 0,
    foodEaten: 0,
    preyEaten: 0,
    hunts: 0,
    huntsWon: 0,
    huntsFailed: 0,
    escapes: 0,
    escapeAttempts: 0,
    splits: 0,
    badSplits: 0,
    ejects: 0,
    virusBaits: 0,
    virusFeeds: 0,
    virusPops: 0,
    switches: 0,
    oscillations: 0,
    lifetimes: [],
    massSamples: 0,
    massSum: 0,
    maxMass: 0,
    stateTime: emptyStateTime(),
    sampleAt: 1,
  };
}

export function onRespawn(brain: BotBrain, x: number, y: number, time: number): void {
  brain.strategy = 'farm';
  brain.since = time;
  brain.lockUntil = 0;
  brain.targetCellId = 0;
  brain.targetOwnerId = 0;
  brain.desiredX = x;
  brain.desiredY = y;
  brain.aimX = x;
  brain.aimY = y;
  brain.aimed = false;
  brain.urgent = false;
  brain.anchorX = x;
  brain.anchorY = y;
  brain.anchorAt = time;
  brain.homeX = x;
  brain.homeY = y;
  brain.pendingThreatId = 0;
  brain.pendingThreatAt = 0;
  brain.threatLatchedAt = 0;
  brain.vulnerableUntil = 0;
  brain.finishUntil = 0;
  brain.spawnCautionUntil = time + AI.memory.spawnCaution;
  brain.bornAt = time;
  brain.lastThreat = 0;
  brain.lastWall = 0;
  brain.chaseSince = time;
  brain.lastProgressAt = time;
  brain.bestChaseDist = Infinity;
  brain.massAtStrategy = 0;
  brain.note = 'spawn';
}

export function recordDeath(brain: BotBrain | undefined, totals: AiTotals, time: number): void {
  if (!brain) return;
  totals.deaths++;
  totals.lifetimes.push(Math.max(0, time - brain.bornAt));
  if (totals.lifetimes.length > 240) totals.lifetimes.shift();
  const ignoredThreat = brain.lastThreat > 1.15
    && brain.strategy !== 'flee'
    && brain.strategy !== 'bait'
    && time - brain.threatLatchedAt > brain.reaction + 0.45;
  const badSplit = time - brain.lastSplitAt < 1.25 && brain.lastSplitRisky;
  const intoWall = brain.lastWall > 0.78;
  if (ignoredThreat || badSplit || intoWall) totals.avoidableDeaths++;
  if (intoWall) brain.lessons.boundary = Math.min(1.5, brain.lessons.boundary + 0.2);
  if (brain.strategy === 'hunt' || brain.strategy === 'stalk') {
    brain.lessons.chase = Math.max(0.55, brain.lessons.chase * 0.88);
    totals.huntsFailed++;
  }
  if (badSplit) {
    brain.lessons.split = Math.min(1.5, brain.lessons.split + 0.22);
    totals.badSplits++;
  }
}

export function recordVirusPop(brain: BotBrain | undefined, totals: AiTotals): void {
  if (!brain) return;
  totals.virusPops++;
  brain.lessons.virus = Math.min(1.6, brain.lessons.virus + 0.25);
}

export function buildReport(
  totals: AiTotals,
  owners: Organism[],
  brains: Map<number, BotBrain>,
  time: number,
): AiReport {
  const stateCounts = emptyStateTime();
  let alive = 0;
  let massNow = 0;
  for (const owner of owners) {
    if (owner.id === 0 || !owner.cells.length) continue;
    alive++;
    massNow += owner.cells.reduce((sum, cell) => sum + cell.mass, 0);
    const brain = brains.get(owner.id);
    if (brain) stateCounts[brain.strategy]++;
  }
  const lives = totals.lifetimes;
  const sorted = [...lives].sort((a, b) => a - b);
  const medianLifetime = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const meanLifetime = lives.length ? lives.reduce((a, b) => a + b, 0) / lives.length : 0;
  const finished = totals.huntsWon + totals.huntsFailed;
  return {
    seconds: time,
    alive,
    deaths: totals.deaths,
    avoidableDeaths: totals.avoidableDeaths,
    avoidableRate: totals.deaths ? totals.avoidableDeaths / totals.deaths : 0,
    foodEaten: totals.foodEaten,
    preyEaten: totals.preyEaten,
    hunts: totals.hunts,
    huntsWon: totals.huntsWon,
    huntsFailed: totals.huntsFailed,
    huntSuccess: finished ? totals.huntsWon / finished : 0,
    escapes: totals.escapes,
    escapeAttempts: totals.escapeAttempts,
    splits: totals.splits,
    ejects: totals.ejects,
    virusBaits: totals.virusBaits,
    virusFeeds: totals.virusFeeds,
    virusPops: totals.virusPops,
    switches: totals.switches,
    oscillations: totals.oscillations,
    averageMass: totals.massSamples ? totals.massSum / totals.massSamples : massNow / Math.max(1, alive),
    currentAverageMass: alive ? massNow / alive : 0,
    maxMass: totals.maxMass,
    medianLifetime,
    meanLifetime,
    stateCounts,
    stateTime: { ...totals.stateTime },
    stateShare: shareOf(totals.stateTime),
  };
}

function shareOf(time: Record<AiStrategy, number>): Record<AiStrategy, number> {
  const total = STRATEGIES.reduce((sum, key) => sum + time[key], 0);
  const share = emptyStateTime();
  if (total <= 0) return share;
  for (const key of STRATEGIES) share[key] = time[key] / total;
  return share;
}

export interface ThreatAssessment {
  score: number;
  closing: number;
  canEat: boolean;
  splitKill: boolean;
  dist: number;
  gap: number;
}

/** How dangerous one cell is. Distance, closing speed and split reach all count. */
export function assessThreat(args: {
  selfX: number;
  selfY: number;
  selfVx: number;
  selfVy: number;
  selfMass: number;
  selfRadius: number;
  otherX: number;
  otherY: number;
  otherVx: number;
  otherVy: number;
  otherMass: number;
  otherRadius: number;
  perception: number;
  fleeMul: number;
}): ThreatAssessment | null {
  const dist = hypot(args.otherX - args.selfX, args.otherY - args.selfY);
  if (!Number.isFinite(dist) || dist > args.perception) return null;
  const safeDist = Math.max(0.01, dist);
  const fleeAt = BALANCE.eatRatio * (args.fleeMul > 1.15 ? 0.94 : 1);
  const canEat = args.otherMass >= args.selfMass * fleeAt;
  const reach = args.otherRadius + impulseTravel(BALANCE.splitImpulse, BALANCE.impulseDecay, 0.45) + args.selfRadius * 0.35;
  const toX = (args.selfX - args.otherX) / safeDist;
  const toY = (args.selfY - args.otherY) / safeDist;
  const closing = (args.otherVx - args.selfVx) * toX + (args.otherVy - args.selfVy) * toY;
  const facing = closing > 8 || dist < reach * 0.58;
  const splitKill = args.otherMass >= BALANCE.minSplitMass
    && args.otherMass / 2 >= args.selfMass * BALANCE.eatRatio
    && dist < reach
    && facing;
  if (!canEat && !splitKill) return null;
  const prox = clamp(1 - dist / args.perception, 0, 1);
  let score = clamp((args.otherMass / Math.max(1, args.selfMass) - 1) * 0.55, 0, 2.4);
  score += prox * prox * 2.6;
  score += clamp(closing / 160, -0.55, 1.5);
  if (splitKill) score += dist < reach * 0.7 ? 1.35 : 0.55;
  if (closing > 25) {
    const tti = (dist - args.selfRadius - args.otherRadius) / closing;
    if (tti < 1.2) score += 1.1;
    else if (tti < 2.5) score += 0.45;
  }
  if (closing < -40 && dist > 420) score *= 0.4;
  if (dist > args.perception * 0.82 && closing < 20) score *= 0.45;
  const gap = dist - args.selfRadius - args.otherRadius;
  if (score < AI.threat.ignoreScore && gap > AI.threat.ignoreGap) return null;
  return { score, closing, canEat, splitKill, dist, gap };
}

export function chooseEscape(args: {
  x: number;
  y: number;
  speed: number;
  radius: number;
  mass: number;
  world: number;
  threats: Array<Pick<ThreatInfo, 'x' | 'y' | 'vx' | 'vy' | 'mass' | 'radius' | 'score' | 'dist'>>;
  viruses: Array<Pick<Virus, 'x' | 'y' | 'radius' | 'mother'>>;
  virusFear?: number;
  boundaryLesson?: number;
  ownerId?: number;
  time?: number;
}): { x: number; y: number; score: number } {
  const headings = AI.performance.headings;
  const jitter = (unitHash((args.ownerId ?? 1) * 17 + Math.floor((args.time ?? 0) * 2)) - 0.5) * 0.2;
  const fear = args.virusFear ?? 1;
  const lesson = args.boundaryLesson ?? 0;
  const pops = args.mass >= BALANCE.virusTriggerMass * AI.virus.fearScale;
  let best = -Infinity;
  let bestX = args.x;
  let bestY = args.y;
  const primary = args.threats[0];
  for (let i = 0; i < headings; i++) {
    const angle = (i / headings) * TAU + jitter;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let score = 0;
    for (const dist of AI.flee.lookahead) {
      const rawX = args.x + dx * dist;
      const rawY = args.y + dy * dist;
      const px = clamp(rawX, 20, args.world - 20);
      const py = clamp(rawY, 20, args.world - 20);
      const shoved = hypot(px - rawX, py - rawY);
      if (shoved > 8) score -= 6 + shoved * 0.03;
      const edge = boundaryDanger(px, py, args.world, AI.flee.wallMargin);
      score -= edge * edge * (16 + lesson * 10) * (dist / 340);
      for (const threat of args.threats) {
        const horizon = dist / Math.max(70, args.speed);
        const tx = threat.x + threat.vx * horizon * 0.7;
        const ty = threat.y + threat.vy * horizon * 0.7;
        const d = hypot(px - tx, py - ty);
        const dangerR = threat.radius + args.radius + 90;
        if (d < dangerR) score -= (1 - d / dangerR) * (8 + threat.score * 6);
        else score += Math.min(2.2, (d - dangerR) / 180) * (0.3 + threat.score * 0.12);
      }
      for (const virus of args.viruses) {
        const d = hypot(px - virus.x, py - virus.y);
        if (virus.mother && args.mass < BALANCE.motherDigestMass) {
          const dangerR = virus.radius + args.radius + 70;
          if (d < dangerR) score -= (1 - d / dangerR) * 7;
        } else if (!virus.mother && pops) {
          const dangerR = virus.radius + args.radius + 36;
          if (d < dangerR) score -= (1 - d / dangerR) * 6.5 * fear * (1 + lesson * 0.15);
        }
      }
    }
    if (primary) {
      const away = ((args.x - primary.x) * dx + (args.y - primary.y) * dy) / (primary.dist || 1);
      score += away * 4.2;
    }
    if (boundaryDanger(args.x, args.y, args.world, AI.flee.wallMargin) > 0.22) {
      const center = ((args.world / 2 - args.x) * dx + (args.world / 2 - args.y) * dy) / args.world;
      score += center * 3.6;
    }
    if (score > best) {
      best = score;
      bestX = clamp(args.x + dx * AI.flee.aimDistance, 48, args.world - 48);
      bestY = clamp(args.y + dy * AI.flee.aimDistance, 48, args.world - 48);
    }
  }
  if (!Number.isFinite(bestX) || !Number.isFinite(bestY)) return { x: args.x, y: args.y, score: 0 };
  return { x: bestX, y: bestY, score: best };
}

export function scorePrey(args: {
  selfX: number;
  selfY: number;
  selfMass: number;
  selfRadius: number;
  selfSpeed: number;
  preyX: number;
  preyY: number;
  preyVx: number;
  preyVy: number;
  preyMass: number;
  preyRadius: number;
  perception: number;
  world: number;
  threatDanger: number;
  predict: number;
  splitUrge: number;
}): { score: number; aimX: number; aimY: number; freeKill: boolean; canSplit: boolean; dist: number; catchable: boolean } | null {
  const dist = hypot(args.preyX - args.selfX, args.preyY - args.selfY);
  if (!Number.isFinite(dist) || dist > args.perception || args.preyMass < AI.hunt.minPreyMass) return null;
  const ratio = args.selfMass / Math.max(1, args.preyMass);
  const reach = args.selfRadius + impulseTravel(BALANCE.splitImpulse, BALANCE.impulseDecay, AI.split.horizon) + args.preyRadius * 0.3;
  const canSplit = args.splitUrge > 0.2
    && args.selfMass >= BALANCE.minSplitMass
    && args.selfMass / 2 >= args.preyMass * BALANCE.eatRatio
    && dist < reach;
  const canEat = ratio >= BALANCE.eatRatio;
  if (!canEat && !canSplit) return null;
  const toX = (args.preyX - args.selfX) / (dist || 1);
  const toY = (args.preyY - args.selfY) / (dist || 1);
  const opening = args.preyVx * toX + args.preyVy * toY;
  const catchRate = args.selfSpeed - opening;
  const catchable = catchRate > -8 || dist < args.selfRadius + args.preyRadius + 80 || (canSplit && dist < reach * 0.85);
  const lead = dist / Math.max(50, args.selfSpeed);
  let aimX = args.preyX + args.preyVx * lead * args.predict;
  let aimY = args.preyY + args.preyVy * lead * args.predict;
  const refined = hypot(aimX - args.selfX, aimY - args.selfY) / Math.max(50, args.selfSpeed);
  aimX = args.preyX + args.preyVx * refined * args.predict;
  aimY = args.preyY + args.preyVy * refined * args.predict;
  // Don't dive deeper into a corner than the prey. Cut them off from the open side.
  const preyWall = boundaryDanger(args.preyX, args.preyY, args.world, 280);
  const aimWall = boundaryDanger(aimX, aimY, args.world, 220);
  if (preyWall > 0.3 && aimWall > preyWall + 0.08) {
    aimX = args.preyX + Math.sign(args.world / 2 - args.preyX) * 36;
    aimY = args.preyY + Math.sign(args.world / 2 - args.preyY) * 36;
  }
  aimX = clamp(aimX, 36, args.world - 36);
  aimY = clamp(aimY, 36, args.world - 36);
  const distFactor = clamp(1.55 - dist / args.perception, 0.18, 1.55);
  let score = Math.sqrt(args.preyMass) * 0.22 * (catchable ? 1 : 0.22) * distFactor;
  score *= 1 + clamp((ratio - 1.25) / 5, 0, 0.7);
  if (canSplit && dist < reach) score += 0.35 * args.splitUrge;
  score -= args.threatDanger * 2.4;
  const trap = boundaryDanger(aimX, aimY, args.world, 240);
  score -= trap * 1.7;
  if (trap > 0.62 && boundaryDanger(args.selfX, args.selfY, args.world, 240) < 0.3) score -= 1.6;
  if (!catchable && !canSplit) score *= 0.35;
  const freeKill = canEat && ratio >= AI.hunt.freeKillRatio && dist < AI.hunt.freeKillDist && args.threatDanger < 0.35 && catchable && trap < 0.55;
  if (freeKill) score += 1.1;
  return { score, aimX, aimY, freeKill, canSplit, dist, catchable };
}

export function splitDecision(args: {
  selfX: number;
  selfY: number;
  selfMass: number;
  selfRadius: number;
  fragments: number;
  preyX: number;
  preyY: number;
  preyMass: number;
  preyRadius: number;
  threats: Array<Pick<ThreatInfo, 'x' | 'y' | 'mass' | 'radius' | 'dist'>>;
  viruses: Array<Pick<Virus, 'x' | 'y' | 'radius' | 'mother'>>;
  splitUrge: number;
  splitBias: number;
  splitLesson: number;
  world: number;
  cooldownReady: boolean;
}): { yes: boolean; risky: boolean } {
  if (!args.cooldownReady) return { yes: false, risky: false };
  if (args.selfMass < BALANCE.minSplitMass) return { yes: false, risky: false };
  const maxPieces = args.splitUrge > 1 ? AI.split.maxPiecesBold : AI.split.maxPiecesCautious;
  if (args.fragments >= maxPieces || args.fragments >= BALANCE.maxFragments) return { yes: false, risky: false };
  if (args.selfMass / 2 < args.preyMass * BALANCE.eatRatio) return { yes: false, risky: false };
  const dist = hypot(args.preyX - args.selfX, args.preyY - args.selfY);
  const reach = args.selfRadius + impulseTravel(BALANCE.splitImpulse, BALANCE.impulseDecay, AI.split.horizon) + args.preyRadius * 0.28;
  if (dist > reach || dist < args.selfRadius * 0.35) return { yes: false, risky: false };
  const half = args.selfMass / 2;
  const angle = Math.atan2(args.preyY - args.selfY, args.preyX - args.selfX);
  const landX = args.selfX + Math.cos(angle) * (args.selfRadius + 90);
  const landY = args.selfY + Math.sin(angle) * (args.selfRadius + 90);
  const pieceRadius = massRadius(half);
  for (const threat of args.threats) {
    if (threat.mass <= half * BALANCE.eatRatio) continue;
    const landDist = hypot(threat.x - landX, threat.y - landY);
    const onTop = threat.dist < threat.radius + args.selfRadius + 90;
    if (onTop || landDist < threat.radius + pieceRadius + 70) return { yes: false, risky: true };
  }
  if (boundaryDanger(landX, landY, args.world, 100) > 0.62) return { yes: false, risky: true };
  if (half > BALANCE.virusTriggerMass * 0.9) {
    for (const virus of args.viruses) {
      if (hypot(virus.x - landX, virus.y - landY) < virus.radius + pieceRadius * 0.55) {
        return { yes: false, risky: true };
      }
    }
  }
  const confidence = args.splitUrge * args.splitBias * (1 - args.splitLesson * 0.45);
  if (args.preyMass * confidence < AI.split.minReward) return { yes: false, risky: false };
  if (confidence < 0.22) return { yes: false, risky: false };
  return { yes: true, risky: false };
}

export function planVirus(args: {
  x: number;
  y: number;
  mass: number;
  radius: number;
  world: number;
  viruses: Array<Pick<Virus, 'x' | 'y' | 'radius' | 'mother'>>;
  threats: Array<Pick<ThreatInfo, 'x' | 'y' | 'vx' | 'vy' | 'mass' | 'score' | 'dist'>>;
  virusBait: number;
}): { baitX: number; baitY: number; baitScore: number; feedAngle: number | null } {
  let baitX = args.x;
  let baitY = args.y;
  let baitScore = 0;
  let feedAngle: number | null = null;
  const wouldPop = args.mass >= BALANCE.virusTriggerMass * AI.virus.fearScale;
  const threat = args.threats[0];
  if (!wouldPop && args.virusBait > 0.2 && threat) {
    for (const virus of args.viruses) {
      if (virus.mother) continue;
      const dSelf = hypot(virus.x - args.x, virus.y - args.y);
      if (dSelf > AI.virus.baitRange || dSelf < 8) continue;
      const ax = virus.x - threat.x;
      const ay = virus.y - threat.y;
      const len = hypot(ax, ay) || 1;
      const px = virus.x + (ax / len) * (virus.radius + args.radius + 34);
      const py = virus.y + (ay / len) * (virus.radius + args.radius + 34);
      if (boundaryDanger(px, py, args.world, 150) > 0.72) continue;
      const closing = threat.vx * (ax / len) + threat.vy * (ay / len);
      const dThreat = hypot(virus.x - threat.x, virus.y - threat.y);
      const threatDist = hypot(threat.x - args.x, threat.y - args.y);
      let score = 1.05 + clamp(closing / 120, 0, 1.1) - dSelf / 820;
      if (dThreat < threatDist + 70) score += 0.5;
      if (score > baitScore) {
        baitScore = score;
        baitX = clamp(px, 40, args.world - 40);
        baitY = clamp(py, 40, args.world - 40);
      }
    }
  }
  if (!wouldPop && args.mass >= BALANCE.minEjectMass + 22) {
    const meal = args.threats.find(item => item.mass >= BALANCE.virusTriggerMass && item.score > 1);
    if (meal) {
      for (const virus of args.viruses) {
        if (virus.mother) continue;
        const d = hypot(virus.x - args.x, virus.y - args.y);
        if (d > AI.virus.feedRange || d < virus.radius * 0.75) continue;
        if (hypot(meal.x - virus.x, meal.y - virus.y) > AI.virus.feedThreatDist) continue;
        const angV = Math.atan2(virus.y - args.y, virus.x - args.x);
        const angT = Math.atan2(meal.y - virus.y, meal.x - virus.x);
        if (angleDiff(angV, angT) > AI.virus.feedAlign) continue;
        feedAngle = angV;
        break;
      }
    }
  }
  return { baitX, baitY, baitScore, feedAngle };
}

export function shouldSwitchTarget(currentScore: number, challengerScore: number, margin = AI.hunt.switchMargin): boolean {
  if (!(currentScore > 0)) return true;
  return challengerScore > currentScore * margin;
}

export function isStuck(brain: Pick<BotBrain, 'anchorX' | 'anchorY' | 'anchorAt'>, x: number, y: number, time: number, targetDist: number): boolean {
  const moved = hypot(x - brain.anchorX, y - brain.anchorY);
  if (moved > AI.movement.stuckMove) return false;
  return time - brain.anchorAt > AI.movement.stuckTime && targetDist > AI.movement.stuckTarget;
}

export function noteMovement(brain: BotBrain, x: number, y: number, time: number): void {
  if (hypot(x - brain.anchorX, y - brain.anchorY) > AI.movement.stuckMove) {
    brain.anchorX = x;
    brain.anchorY = y;
    brain.anchorAt = time;
  }
}

export function commitStrategy(
  brain: Pick<BotBrain, 'strategy' | 'since' | 'lockUntil' | 'switchTimes' | 'oscillations'>,
  scores: Partial<Record<AiStrategy, number>>,
  time: number,
  panic: boolean,
  emergency: boolean,
): { strategy: AiStrategy; oscillated: boolean } {
  const table = emptyStateTime();
  for (const key of STRATEGIES) table[key] = Number.isFinite(scores[key]) ? scores[key] as number : 0;
  let best: AiStrategy = 'explore';
  let bestScore = -Infinity;
  for (const key of STRATEGIES) {
    if (table[key] > bestScore) {
      bestScore = table[key];
      best = key;
    }
  }
  if (panic) return { strategy: 'flee', oscillated: false };
  if (emergency) best = table.bait > table.flee * 0.9 && table.bait > 2.3 ? 'bait' : 'flee';
  if (time < brain.lockUntil && !emergency) return { strategy: brain.strategy, oscillated: false };
  if (best === brain.strategy) return { strategy: best, oscillated: false };

  const currentScore = table[brain.strategy] ?? 0;
  const age = time - brain.since;
  const same = family(best) === family(brain.strategy);
  if (!emergency && !same && age < (MIN_DURATION[brain.strategy] ?? 0.4)) {
    if (bestScore < currentScore * AI.hysteresis.override + 0.35) return { strategy: brain.strategy, oscillated: false };
  }
  if (!emergency && !same && currentScore > 0.12) {
    const needed = currentScore * (1 + AI.hysteresis.margin) + AI.hysteresis.absolute * 0.25;
    if (bestScore < needed) return { strategy: brain.strategy, oscillated: false };
  }
  if (!same) {
    brain.switchTimes.push(time);
    while (brain.switchTimes.length && time - brain.switchTimes[0] > AI.hysteresis.lockWindow) brain.switchTimes.shift();
    if (brain.switchTimes.length >= AI.hysteresis.lockSwitches && !emergency) {
      brain.lockUntil = time + AI.hysteresis.lockDuration;
      brain.oscillations++;
      return { strategy: brain.strategy, oscillated: true };
    }
  }
  return { strategy: best, oscillated: false };
}

interface SelfView {
  x: number;
  y: number;
  mass: number;
  largestMass: number;
  smallestMass: number;
  radius: number;
  speed: number;
  vx: number;
  vy: number;
  count: number;
  cell: Cell;
}

function viewSelf(owner: Organism): SelfView {
  let x = 0;
  let y = 0;
  let mass = 0;
  let largest = owner.cells[0];
  let smallest = owner.cells[0].mass;
  for (const cell of owner.cells) {
    x += cell.x * cell.mass;
    y += cell.y * cell.mass;
    mass += cell.mass;
    if (cell.mass > largest.mass) largest = cell;
    if (cell.mass < smallest) smallest = cell.mass;
  }
  mass = Math.max(0.01, mass);
  return {
    x: x / mass,
    y: y / mass,
    mass,
    largestMass: largest.mass,
    smallestMass: smallest,
    radius: largest.radius,
    speed: cellSpeed(largest.mass),
    vx: (largest.x - largest.lx) * STEP_RATE,
    vy: (largest.y - largest.ly) * STEP_RATE,
    count: owner.cells.length,
    cell: largest,
  };
}

function sizeMods(mass: number) {
  if (mass < AI.size.tiny) return { hunt: 0.32, flee: 1.3, food: 1.32, split: 0.35 };
  if (mass < AI.size.small) return { hunt: 0.68, flee: 1.12, food: 1.16, split: 0.65 };
  if (mass < AI.size.medium) return { hunt: 1, flee: 1, food: 1, split: 1 };
  if (mass < AI.size.large) return { hunt: 1.16, flee: 0.9, food: 0.8, split: 1.05 };
  return { hunt: 1.02, flee: 0.78, food: 0.52, split: 0.62 };
}

function pointDanger(
  x: number,
  y: number,
  self: SelfView,
  threats: ThreatInfo[],
  viruses: Virus[],
  world: number,
  brain: BotBrain,
  time: number,
): number {
  let danger = boundaryDanger(x, y, world, 300) * (1.15 + brain.lessons.boundary);
  for (const threat of threats) {
    const dist = hypot(threat.x - x, threat.y - y);
    const influence = threat.radius + self.radius + 170;
    if (dist < influence) danger += threat.score * (1 - dist / influence) * 2.1;
    else if (dist < influence + 200) danger += threat.score * 0.22;
  }
  const pops = self.mass >= BALANCE.virusTriggerMass * AI.virus.fearScale;
  for (const virus of viruses) {
    const dist = hypot(virus.x - x, virus.y - y);
    if (virus.mother && self.mass < BALANCE.motherDigestMass && dist < virus.radius + self.radius + 120) {
      danger += (1 - dist / (virus.radius + self.radius + 120)) * 1.8;
    } else if (!virus.mother && pops && dist < self.radius + virus.radius + 70) {
      danger += 1.3 * (1 + brain.lessons.virus);
    }
  }
  if (brain.avoidUntil > time) {
    const dist = hypot(brain.avoidX - x, brain.avoidY - y);
    if (dist < 300) danger += (300 - dist) / 300 * 0.7;
  }
  return danger;
}

function collectThreats(
  owner: Organism,
  self: SelfView,
  cells: Cell[],
  ownerOf: (id: number) => Organism | undefined,
  perception: number,
  mode: GameMode,
  time: number,
  fleeMul: number,
): ThreatInfo[] {
  const found: ThreatInfo[] = [];
  const seen = new Set<number>();
  const broad = perception + 280;
  for (const other of cells) {
    if (!other.alive || other.owner === owner.id) continue;
    if (Math.abs(other.x - self.x) > broad || Math.abs(other.y - self.y) > broad) continue;
    const otherOwner = ownerOf(other.owner);
    if (!otherOwner) continue;
    if (mode === 'teams' && otherOwner.team === owner.team) continue;
    if (otherOwner.protectedUntil > time + 0.55) continue;
    const otherVx = (other.x - other.lx) * STEP_RATE;
    const otherVy = (other.y - other.ly) * STEP_RATE;
    let best: ThreatAssessment | null = null;
    let bestCell = other;
    for (const mine of owner.cells) {
      const assessed = assessThreat({
        selfX: mine.x, selfY: mine.y, selfVx: self.vx, selfVy: self.vy,
        selfMass: mine.mass, selfRadius: mine.radius,
        otherX: other.x, otherY: other.y, otherVx, otherVy,
        otherMass: other.mass, otherRadius: other.radius,
        perception, fleeMul,
      });
      if (assessed && (!best || assessed.score > best.score)) {
        best = assessed;
        bestCell = mine;
      }
    }
    if (!best || seen.has(other.id)) continue;
    seen.add(other.id);
    const protectionFade = otherOwner.protectedUntil > time ? 0.65 : 1;
    found.push({
      id: other.id,
      ownerId: other.owner,
      x: other.x,
      y: other.y,
      vx: otherVx,
      vy: otherVy,
      mass: other.mass,
      radius: other.radius,
      dist: hypot(other.x - bestCell.x, other.y - bestCell.y),
      score: best.score * protectionFade,
      closing: best.closing,
      canEat: best.canEat,
      splitKill: best.splitKill,
      gap: best.gap,
    });
  }
  found.sort((a, b) => b.score - a.score);
  if (found.length > AI.performance.maxThreats) found.length = AI.performance.maxThreats;
  return found;
}

function selectPrey(
  owner: Organism,
  self: SelfView,
  cells: Cell[],
  threats: ThreatInfo[],
  ownerOf: (id: number) => Organism | undefined,
  brain: BotBrain,
  personality: Personality,
  perception: number,
  world: number,
  mode: GameMode,
  time: number,
): PreyChoice | null {
  let best: PreyChoice | null = null;
  let locked: PreyChoice | null = null;
  const predict = personality.predict;
  for (const other of cells) {
    if (!other.alive || other.owner === owner.id) continue;
    if (Math.abs(other.x - self.x) > perception || Math.abs(other.y - self.y) > perception) continue;
    const otherOwner = ownerOf(other.owner);
    if (!otherOwner || otherOwner.protectedUntil > time) continue;
    if (mode === 'teams' && otherOwner.team === owner.team) continue;
    if (brain.abandonOwner === other.owner && time < brain.abandonUntil && other.id !== brain.targetCellId) continue;
    const pvx = (other.x - other.lx) * STEP_RATE;
    const pvy = (other.y - other.ly) * STEP_RATE;
    let threatDanger = 0;
    for (const threat of threats) {
      if (hypot(threat.x - other.x, threat.y - other.y) < 420 && threat.mass > self.mass * BALANCE.eatRatio * 0.95) {
        threatDanger += threat.score * 0.85;
      }
    }
    const scored = scorePrey({
      selfX: self.x, selfY: self.y, selfMass: self.largestMass, selfRadius: self.radius, selfSpeed: self.speed,
      preyX: other.x, preyY: other.y, preyVx: pvx, preyVy: pvy,
      preyMass: other.mass, preyRadius: other.radius,
      perception, world, threatDanger, predict, splitUrge: personality.split,
    });
    if (!scored) continue;
    let score = scored.score;
    if (other.id === brain.targetCellId) {
      const stalled = time - brain.lastProgressAt;
      const chasing = time - brain.chaseSince;
      if (chasing > personality.persistence * brain.lessons.chase && stalled > AI.hunt.abandonProgress) {
        brain.abandonOwner = other.owner;
        brain.abandonUntil = time + AI.memory.abandonSeconds;
        score *= 0.15;
      }
    }
    const choice: PreyChoice = {
      id: other.id,
      ownerId: other.owner,
      x: other.x,
      y: other.y,
      vx: pvx,
      vy: pvy,
      mass: other.mass,
      radius: other.radius,
      dist: scored.dist,
      score,
      aimX: scored.aimX,
      aimY: scored.aimY,
      freeKill: scored.freeKill,
      canSplit: scored.canSplit,
    };
    if (!best || score > best.score) best = choice;
    if (scored.dist > AI.perception.noiseMinDist) {
      const noise = unitHash(other.id * 13 + Math.floor(time * 2));
      const mag = scored.dist * AI.perception.noise * clamp(1.15 - personality.predict, 0.05, 0.8);
      choice.aimX = clamp(choice.aimX + Math.cos(noise * TAU) * mag, 36, world - 36);
      choice.aimY = clamp(choice.aimY + Math.sin(noise * TAU) * mag, 36, world - 36);
    }
    if (other.id === brain.targetCellId) locked = choice;
  }
  if (locked && best && locked.id !== best.id && !shouldSwitchTarget(locked.score, best.score)) return locked;
  return best;
}

function bestFood(
  self: SelfView,
  foodNear: (x: number, y: number, radius: number) => Iterable<Food>,
  ejected: EjectedMass[],
  threats: ThreatInfo[],
  viruses: Virus[],
  brain: BotBrain,
  world: number,
  time: number,
  ownerId: number,
): { x: number; y: number; score: number; count: number } | null {
  const radius = AI.performance.foodRadius;
  const bucket = AI.farm.bucket;
  const clusters = new Map<number, { x: number; y: number; mass: number; count: number }>();
  let seen = 0;
  for (const food of foodNear(self.x, self.y, radius)) {
    const dx = food.x - self.x;
    const dy = food.y - self.y;
    if (dx * dx + dy * dy > radius * radius) continue;
    const key = Math.floor(food.x / bucket) + Math.floor(food.y / bucket) * 64;
    const cluster = clusters.get(key) ?? { x: 0, y: 0, mass: 0, count: 0 };
    cluster.x += food.x;
    cluster.y += food.y;
    cluster.mass += food.mass;
    cluster.count++;
    clusters.set(key, cluster);
    if (++seen > AI.performance.maxFood * 2) break;
  }
  for (const mass of ejected) {
    if (mass.mass <= 0 || self.mass < mass.mass * BALANCE.ejectEatRatio) continue;
    if (mass.owner === ownerId && time - mass.born < 1.4) continue;
    const dx = mass.x - self.x;
    const dy = mass.y - self.y;
    if (dx * dx + dy * dy > radius * radius) continue;
    const key = Math.floor(mass.x / bucket) + Math.floor(mass.y / bucket) * 64 + 4096;
    clusters.set(key, { x: mass.x, y: mass.y, mass: mass.mass * 1.4, count: 1 });
  }
  let best: { x: number; y: number; score: number; count: number } | null = null;
  const speed = hypot(self.vx, self.vy);
  for (const cluster of clusters.values()) {
    const cx = cluster.x / cluster.count;
    const cy = cluster.y / cluster.count;
    const dist = hypot(cx - self.x, cy - self.y);
    const travel = dist / Math.max(40, self.speed);
    const danger = pointDanger(cx, cy, self, threats, viruses, world, brain, time);
    let score = Math.sqrt(Math.max(0.1, cluster.mass)) * (0.45 + cluster.count * 0.07);
    score /= 1 + travel * 0.5;
    score -= danger * (1.35 / Math.max(0.45, brain.risk));
    if (cluster.count >= 4) score += 0.32;
    if (speed > 8 && dist > 1) {
      const align = ((cx - self.x) * self.vx + (cy - self.y) * self.vy) / (dist * speed);
      score += Math.max(0, align) * 0.28;
    }
    if (!best || score > best.score) best = { x: cx, y: cy, score, count: cluster.count };
  }
  if (brain.foodUntil > time && brain.foodScore > 0) {
    const heldDanger = pointDanger(brain.foodX, brain.foodY, self, threats, viruses, world, brain, time);
    const held = brain.foodScore - Math.max(0, heldDanger - 0.2);
    if (held > 0.15 && (!best || held >= best.score * AI.farm.keepMargin)) {
      return { x: brain.foodX, y: brain.foodY, score: held, count: 2 };
    }
  }
  return best;
}

function explorePoint(self: SelfView, brain: BotBrain, personality: Personality, time: number, world: number): { x: number; y: number } {
  const bucket = Math.floor(time / 1.6);
  const angle = unitHash(Math.round(brain.homeX) + brain.sideSign * 13 + bucket * 17) * TAU;
  let x = self.x + Math.cos(angle) * (400 + personality.wander * 280);
  let y = self.y + Math.sin(angle) * (400 + personality.wander * 280);
  if (boundaryDanger(self.x, self.y, world, 260) > 0.38) {
    x = self.x + Math.sign(world / 2 - self.x) * 520;
    y = self.y + Math.sign(world / 2 - self.y) * 360;
  } else if (personality.wander < 0.5 && self.mass > 700) {
    const patrol = unitHash(bucket + 5) * TAU;
    x = brain.homeX + Math.cos(patrol) * 400;
    y = brain.homeY + Math.sin(patrol) * 400;
  }
  return { x: clamp(x, 70, world - 70), y: clamp(y, 70, world - 70) };
}

function separation(self: SelfView, cells: Cell[], ownerId: number): { x: number; y: number; crowd: number } {
  let sx = 0;
  let sy = 0;
  let crowd = 0;
  for (const cell of cells) {
    if (cell.owner === ownerId) continue;
    const dx = self.x - cell.x;
    const dy = self.y - cell.y;
    const dist = hypot(dx, dy);
    if (dist < 320) crowd++;
    const ratio = cell.mass / Math.max(1, self.largestMass);
    if (dist > 1 && dist < self.radius + cell.radius + 36 && ratio > 0.75 && ratio < 1.35) {
      sx += dx / dist * 28;
      sy += dy / dist * 28;
    }
  }
  return { x: sx, y: sy, crowd };
}

export function think(input: ThinkInput): Decision {
  const { owner, brain, time, world, mode } = input;
  const personality = personalityOf(owner.archetype);
  const self = viewSelf(owner);
  const size = sizeMods(self.mass);
  const perception = clamp(
    AI.perception.base * brain.perceptionMul * (self.mass > 900 ? 0.94 : 1),
    AI.perception.min,
    AI.perception.max,
  );
  const threats = collectThreats(owner, self, input.cells, input.ownerOf, perception, mode, time, personality.flee);
  const wall = boundaryDanger(self.x, self.y, world, AI.flee.wallMargin);
  const nearbyViruses = input.viruses.filter(virus => hypot(virus.x - self.x, virus.y - self.y) <= perception);
  const prey = selectPrey(owner, self, input.cells, threats, input.ownerOf, brain, personality, perception, world, mode, time);
  const food = bestFood(self, input.foodNear, input.ejected, threats, nearbyViruses, brain, world, time, owner.id);
  const escape = chooseEscape({
    x: self.x, y: self.y, speed: self.speed, radius: self.radius, mass: self.mass, world,
    threats, viruses: nearbyViruses, virusFear: personality.virusFear * (1 + brain.lessons.virus * 0.4),
    boundaryLesson: brain.lessons.boundary, ownerId: owner.id, time,
  });
  const virus = planVirus({
    x: self.x, y: self.y, mass: self.mass, radius: self.radius, world,
    viruses: nearbyViruses, threats, virusBait: personality.virusBait,
  });

  const top = threats[0];
  if (top && top.id !== brain.pendingThreatId) {
    brain.pendingThreatId = top.id;
    brain.pendingThreatAt = time;
    brain.threatLatchedAt = 0;
  }
  if (!top) {
    brain.pendingThreatId = 0;
    brain.threatLatchedAt = 0;
  }
  const emergencyDist = self.radius + (top?.radius ?? 0) + AI.perception.emergencyGap;
  const reacted = !top || time - brain.pendingThreatAt >= brain.reaction || top.dist < emergencyDist;
  const active = reacted ? top : undefined;
  if (active && brain.threatLatchedAt <= 0) brain.threatLatchedAt = time;

  const panic = !!active && active.canEat && active.gap < AI.threat.panicGap;
  const lethal = !!active && (panic || (active.score >= AI.threat.lethalScore && (active.gap < 220 || (active.closing > 10 && active.gap / active.closing < 2.6))));
  const cautious = time < brain.spawnCautionUntil;
  const protectedNow = owner.protectedUntil > time + 0.45;

  let fleeScore = 0;
  if (active && !protectedNow) {
    fleeScore = active.score * personality.flee * size.flee * (cautious ? 1.22 : 1);
    if (time < brain.vulnerableUntil) fleeScore *= 1.18;
    if (lethal) fleeScore = Math.max(fleeScore, 6.3);
    if (panic) fleeScore = Math.max(fleeScore, 9.4);
  } else if (active && protectedNow) {
    fleeScore = active.score * 0.28;
  }
  let surround = 0;
  for (const threat of threats) if (threat.score > 0.7 && threat.dist < AI.threat.surroundRadius) surround++;
  if (surround >= 2 && !protectedNow) fleeScore += 1.3;
  if (surround >= 3 && !protectedNow) fleeScore += 1.1;

  let virusHazard = 0;
  const pops = self.mass >= BALANCE.virusTriggerMass * AI.virus.fearScale;
  for (const hazard of nearbyViruses) {
    const dist = hypot(hazard.x - self.x, hazard.y - self.y);
    if (hazard.mother && self.smallestMass < BALANCE.motherDigestMass && dist < hazard.radius + self.radius + 160) {
      virusHazard += (1 - dist / (hazard.radius + self.radius + 160)) * 1.6;
    } else if (!hazard.mother && pops && dist < self.radius + hazard.radius + 55) {
      virusHazard += (1 - dist / (self.radius + hazard.radius + 55)) * personality.virusFear * (1 + brain.lessons.virus);
    }
  }
  if (virusHazard > 0.4) fleeScore = Math.max(fleeScore, 2.1 + virusHazard);

  let huntScore = 0;
  let stalkScore = 0;
  if (prey) {
    huntScore = prey.score * personality.chase * size.hunt * brain.lessons.chase * (0.75 + brain.risk * 0.35);
    if (prey.freeKill && !lethal) huntScore = Math.max(huntScore, 3.85);
    if (lethal) huntScore *= 0.22;
    if (cautious) huntScore *= 0.52;
    if (time < brain.finishUntil) huntScore += 1.15;
    if (personality.stalk > 0.6 && prey.dist > self.radius + 130 && !lethal && !prey.freeKill) {
      stalkScore = huntScore * (0.92 + personality.stalk * 0.22);
      huntScore *= 0.62;
    }
  }

  let farmScore = food ? Math.max(0, food.score) * personality.food * brain.foodBias * size.food : 0.12;
  if (lethal) farmScore *= 0.18;
  if (self.mass > AI.size.large && food && food.count < 3) farmScore *= 0.55;

  let exploreScore = (0.4 + personality.wander * 0.38) * (food && food.score > 0.8 ? 0.55 : 1);
  if (self.mass > AI.size.large) exploreScore *= 0.62;
  if (brain.strategy === 'farm' && time - brain.since > 9 && self.mass < brain.massAtStrategy + 6) exploreScore += 1.15;

  let baitScore = 0;
  if (!panic && active && personality.virusBait > 0.28 && virus.baitScore > 0.7 && self.mass < BALANCE.virusTriggerMass * AI.virus.baitScale) {
    baitScore = Math.max(fleeScore, 2) * 0.82 * personality.virusBait + virus.baitScore;
    if (baitScore < 2.15) baitScore = 0;
  }

  let recoverScore = 0;
  if (time < brain.vulnerableUntil && !panic) recoverScore = 2.15 * Math.min(1.4, personality.flee);

  let repositionScore = wall * (2.7 + brain.lessons.boundary * 1.5);
  if (prey && prey.dist < 200 && huntScore > 2.2) repositionScore *= 0.35;

  const space = separation(self, input.cells, owner.id);
  if (space.crowd > 7 && self.mass < AI.size.small + 40) repositionScore += 0.7;

  if (brain.strategy === 'flee' && time - brain.since > AI.memory.fleeMax && !panic) {
    brain.since = time - 10;
    brain.lockUntil = 0;
  }

  const committed = commitStrategy(brain, {
    flee: fleeScore,
    bait: baitScore,
    hunt: huntScore,
    stalk: stalkScore,
    farm: farmScore,
    explore: Math.max(0.18, exploreScore),
    recover: recoverScore,
    reposition: repositionScore,
  }, time, panic, lethal || panic);
  let strategy = committed.strategy;

  const desiredDist = hypot(brain.desiredX - self.x, brain.desiredY - self.y);
  noteMovement(brain, self.x, self.y, time);
  if (!panic && isStuck(brain, self.x, self.y, time, desiredDist)) {
    strategy = 'explore';
    brain.lockUntil = time + 0.85;
    brain.anchorAt = time;
    brain.anchorX = self.x;
    brain.anchorY = self.y;
  }

  let x = self.x;
  let y = self.y;
  let note: string = strategy;
  if (strategy === 'flee' || strategy === 'recover' || (strategy === 'reposition' && active)) {
    x = escape.x;
    y = escape.y;
    note = active ? `${strategy}:${Math.round(active.mass)}` : strategy;
    if (active) {
      brain.avoidX = active.x;
      brain.avoidY = active.y;
      brain.avoidUntil = time + AI.memory.avoidSeconds;
    }
  } else if (strategy === 'reposition') {
    x = clamp(self.x + Math.sign(world / 2 - self.x) * 460, 80, world - 80);
    y = clamp(self.y + Math.sign(world / 2 - self.y) * 460, 80, world - 80);
    note = 'wall';
  } else if (strategy === 'bait') {
    x = virus.baitX;
    y = virus.baitY;
    note = 'bait';
  } else if ((strategy === 'hunt' || strategy === 'stalk') && prey) {
    const side = brain.sideSign * personality.stalk * 64;
    const len = prey.dist || 1;
    const px = -(prey.y - self.y) / len;
    const py = (prey.x - self.x) / len;
    x = prey.aimX + px * side * (strategy === 'stalk' ? 1 : 0.25);
    y = prey.aimY + py * side * (strategy === 'stalk' ? 1 : 0.25);
    if (strategy === 'stalk') {
      x = self.x * 0.35 + x * 0.65;
      y = self.y * 0.35 + y * 0.65;
    }
    note = `${strategy}:${prey.ownerId}`;
    if (brain.targetCellId !== prey.id) {
      brain.targetCellId = prey.id;
      brain.targetOwnerId = prey.ownerId;
      brain.chaseSince = time;
      brain.bestChaseDist = prey.dist;
      brain.lastProgressAt = time;
    } else if (prey.dist < brain.bestChaseDist - 12) {
      brain.bestChaseDist = prey.dist;
      brain.lastProgressAt = time;
    }
  } else if (strategy === 'farm' && food) {
    x = food.x;
    y = food.y;
    brain.foodX = food.x;
    brain.foodY = food.y;
    brain.foodScore = food.score;
    brain.foodUntil = time + AI.farm.keepSeconds;
    note = `farm:${food.count}`;
  } else {
    const roam = explorePoint(self, brain, personality, time, world);
    x = roam.x;
    y = roam.y;
    note = 'explore';
  }

  if (strategy === 'farm' || strategy === 'explore') {
    x += space.x;
    y += space.y;
    if (mode === 'teams' && space.crowd < 5) {
      let ax = 0;
      let ay = 0;
      let allies = 0;
      for (const cell of input.cells) {
        const ally = input.ownerOf(cell.owner);
        if (!ally || ally.id === owner.id || ally.team !== owner.team) continue;
        if (hypot(cell.x - self.x, cell.y - self.y) > perception) continue;
        ax += cell.x;
        ay += cell.y;
        allies++;
        if (allies >= 4) break;
      }
      if (allies > 0) {
        x = x * 0.78 + (ax / allies) * 0.22;
        y = y * 0.78 + (ay / allies) * 0.22;
      }
    }
  }

  let abandoned = false;
  const wasHunting = brain.strategy === 'hunt' || brain.strategy === 'stalk';
  const stillHunting = strategy === 'hunt' || strategy === 'stalk';
  if (wasHunting && !stillHunting && brain.targetCellId) {
    const stalled = time - brain.lastProgressAt > AI.hunt.abandonProgress && time - brain.chaseSince > 0.7;
    if (stalled || lethal) {
      abandoned = true;
      brain.abandonOwner = brain.targetOwnerId;
      brain.abandonUntil = time + AI.memory.abandonSeconds;
      brain.lessons.chase = Math.max(0.6, brain.lessons.chase * 0.98);
    }
    brain.targetCellId = 0;
  }

  let split = false;
  let splitRisky = false;
  let angle = 0;
  const splitReady = time >= owner.splitAt && time + 0.35 >= brain.vulnerableUntil;
  if (stillHunting && prey && splitReady && !panic) {
    const verdict = splitDecision({
      selfX: self.x, selfY: self.y, selfMass: self.largestMass, selfRadius: self.radius,
      fragments: self.count,
      preyX: prey.x, preyY: prey.y, preyMass: prey.mass, preyRadius: prey.radius,
      threats, viruses: nearbyViruses,
      splitUrge: personality.split * size.split,
      splitBias: brain.splitBias,
      splitLesson: brain.lessons.split,
      world,
      cooldownReady: true,
    });
    split = verdict.yes;
    splitRisky = verdict.risky;
    angle = Math.atan2(prey.aimY - self.y, prey.aimX - self.x);
  }

  let eject = false;
  let ejectAngle = 0;
  if (!split && virus.feedAngle !== null && time >= brain.ejectAt && (strategy === 'flee' || strategy === 'bait' || strategy === 'reposition')) {
    eject = true;
    ejectAngle = virus.feedAngle;
  }

  x = clamp(Number.isFinite(x) ? x : self.x, 28, world - 28);
  y = clamp(Number.isFinite(y) ? y : self.y, 28, world - 28);
  const urgent = panic || lethal || strategy === 'flee';
  const lod = input.focusDist > AI.performance.farDistance ? AI.performance.lodFactor : 1;
  let interval = (AI.performance.thinkMin + input.random() * AI.performance.thinkJitter) * lod * personality.think;
  if (urgent) interval = Math.min(interval, 0.08);
  if (!Number.isFinite(interval) || interval <= 0) interval = AI.performance.thinkMin;

  return {
    strategy,
    x,
    y,
    urgent,
    split,
    angle,
    splitRisky,
    eject,
    ejectAngle,
    ejectKind: eject ? 'feed' : 'none',
    interval,
    perception,
    threat: active?.score ?? 0,
    hunt: huntScore,
    farm: farmScore,
    flee: fleeScore,
    wall,
    note,
    abandoned,
    baited: strategy === 'bait',
    oscillated: committed.oscillated,
    threatId: active?.id ?? 0,
  };
}
