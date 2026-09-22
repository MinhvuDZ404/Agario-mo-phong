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
  AiArchetype, AiDeathReason, AiMemoryPoint, AiSituation, AiStrategy, AiTargetMemory, AiWinReason,
  Cell, EjectedMass, Food, GameMode, Organism, Virus,
} from './types';

const TAU = Math.PI * 2;
const STEP_RATE = 1 / BALANCE.fixedStep;

const STRATEGIES: AiStrategy[] = ['flee', 'bait', 'hunt', 'stalk', 'farm', 'explore', 'recover', 'reposition'];
const DEATH_REASONS: AiDeathReason[] = ['PREDATOR_CONTACT', 'BAD_SPLIT', 'BOUNDARY_TRAP', 'VIRUS_POP', 'CHASE_OVERCOMMIT', 'CROWD_COLLISION', 'UNKNOWN'];
const WIN_REASONS: AiWinReason[] = ['SAFE_FARM', 'FREE_KILL', 'SUCCESSFUL_SPLIT', 'VIRUS_BAIT', 'INTERCEPT', 'OPPORTUNISTIC_EAT'];

function emptyReasons<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map(key => [key, 0])) as Record<T, number>;
}

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
  /** V2 world model: context is local, short-lived, and always explainable. */
  situation: AiSituation;
  dangerLevel: number;
  opportunityLevel: number;
  crowdingLevel: number;
  mobilityLevel: number;
  growthPotential: number;
  escapeQuality: number;
  strategyConfidence: number;
  targetScore: number;
  targetCommitment: number;
  targetSeenAt: number;
  interceptX: number;
  interceptY: number;
  targetEscapeX: number;
  targetEscapeY: number;
  timeToIntercept: number;
  huntProbability: number;
  pressureScore: number;
  lastFreeKill: boolean;
  lastAction: AiStrategy | 'split' | 'eject' | 'none';
  lastActionAt: number;
  lastOutcomeAt: number;
  recentDangerZones: AiMemoryPoint[];
  recentFailedTargets: AiTargetMemory[];
  recentSuccessfulTargets: AiTargetMemory[];
  recentEscapeDirections: AiMemoryPoint[];
  recentFarmRegions: AiMemoryPoint[];
  lastDeathReason: AiDeathReason | null;
  lastWinReason: AiWinReason | null;
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
  decisions: number;
  decisionQualitySum: number;
  decisionQualitySamples: number;
  deathReasons: Record<AiDeathReason, number>;
  winReasons: Record<AiWinReason, number>;
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
  decisions: number;
  decisionQuality: number;
  deathReasons: Record<AiDeathReason, number>;
  winReasons: Record<AiWinReason, number>;
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
  interceptX: number;
  interceptY: number;
  escapeX: number;
  escapeY: number;
  strategy: AiStrategy;
  situation: AiSituation;
  perception: number;
  confidence: number;
  targetScore: number;
  threat: number;
  huntProbability: number;
  timeToIntercept: number;
  escapeQuality: number;
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
  timeToIntercept: number;
  approach: number;
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
  successProbability: number;
  timeToIntercept: number;
  escapeQuality: number;
  pressureScore: number;
  competitorRisk: number;
  interceptX: number;
  interceptY: number;
  targetEscapeX: number;
  targetEscapeY: number;
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
  situation: AiSituation;
  confidence: number;
  targetId: number;
  timeToIntercept: number;
  huntProbability: number;
  escapeQuality: number;
  crowding: number;
  opportunity: number;
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
    situation: 'SAFE_FARM',
    dangerLevel: 0,
    opportunityLevel: 0,
    crowdingLevel: 0,
    mobilityLevel: 1,
    growthPotential: 0,
    escapeQuality: 1,
    strategyConfidence: 0.55,
    targetScore: 0,
    targetCommitment: 0,
    targetSeenAt: time,
    interceptX: x,
    interceptY: y,
    targetEscapeX: x,
    targetEscapeY: y,
    timeToIntercept: Infinity,
    huntProbability: 0,
    pressureScore: 0,
    lastFreeKill: false,
    lastAction: 'none',
    lastActionAt: time,
    lastOutcomeAt: time,
    recentDangerZones: [],
    recentFailedTargets: [],
    recentSuccessfulTargets: [],
    recentEscapeDirections: [],
    recentFarmRegions: [],
    lastDeathReason: null,
    lastWinReason: null,
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
    decisions: 0,
    decisionQualitySum: 0,
    decisionQualitySamples: 0,
    deathReasons: emptyReasons(DEATH_REASONS),
    winReasons: emptyReasons(WIN_REASONS),
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
  brain.situation = 'SAFE_FARM';
  brain.dangerLevel = 0;
  brain.opportunityLevel = 0;
  brain.crowdingLevel = 0;
  brain.mobilityLevel = 1;
  brain.growthPotential = 0;
  brain.escapeQuality = 1;
  brain.strategyConfidence = 0.55;
  brain.targetScore = 0;
  brain.targetCommitment = 0;
  brain.targetSeenAt = time;
  brain.interceptX = x;
  brain.interceptY = y;
  brain.targetEscapeX = x;
  brain.targetEscapeY = y;
  brain.timeToIntercept = Infinity;
  brain.huntProbability = 0;
  brain.pressureScore = 0;
  brain.lastFreeKill = false;
  brain.lastAction = 'none';
  brain.lastActionAt = time;
  brain.lastOutcomeAt = time;
  brain.recentDangerZones.length = 0;
  brain.recentFailedTargets.length = 0;
  brain.recentSuccessfulTargets.length = 0;
  brain.recentEscapeDirections.length = 0;
  brain.recentFarmRegions.length = 0;
  brain.lastDeathReason = null;
  brain.lastWinReason = null;
  brain.note = 'spawn';
}

function pruneMemory(brain: BotBrain, time: number): void {
  const cutoff = time - AI.context.regionMemorySeconds;
  const trim = <T extends { at: number }>(items: T[]) => {
    while (items.length && items[0].at < cutoff) items.shift();
    if (items.length > AI.performance.maxMemoryEvents) items.splice(0, items.length - AI.performance.maxMemoryEvents);
  };
  trim(brain.recentDangerZones);
  trim(brain.recentSuccessfulTargets);
  trim(brain.recentFailedTargets);
  trim(brain.recentEscapeDirections);
  trim(brain.recentFarmRegions);
}

function rememberPoint(items: AiMemoryPoint[], x: number, y: number, value: number, time: number): void {
  items.push({ x, y, value, at: time });
  if (items.length > AI.performance.maxMemoryEvents) items.shift();
}

export function rememberDanger(brain: BotBrain, x: number, y: number, score: number, time: number): void {
  pruneMemory(brain, time);
  rememberPoint(brain.recentDangerZones, x, y, score, time);
}

export function rememberFarmRegion(brain: BotBrain, x: number, y: number, score: number, time: number): void {
  pruneMemory(brain, time);
  rememberPoint(brain.recentFarmRegions, x, y, score, time);
}

export type BotOutcome = 'escape_success' | 'escape_failure' | 'hunt_success' | 'hunt_failure'
  | 'split_success' | 'split_failure' | 'virus_success' | 'virus_failure' | 'safe_farm' | 'opportunistic_eat';

export function classifyDeathReason(brain: BotBrain, time: number): AiDeathReason {
  if (time - brain.lastSplitAt < 1.25 && brain.lastSplitRisky) return 'BAD_SPLIT';
  if (brain.lastWall > 0.78 && brain.mobilityLevel < 0.45) return 'BOUNDARY_TRAP';
  if (brain.lastWinReason === 'VIRUS_BAIT' || brain.situation === 'VIRUS_OPPORTUNITY') return 'VIRUS_POP';
  if ((brain.strategy === 'hunt' || brain.strategy === 'stalk')
    && time - brain.chaseSince > AI.planning.noWinGrace) return 'CHASE_OVERCOMMIT';
  if (brain.crowdingLevel >= AI.context.crowdDanger) return 'CROWD_COLLISION';
  if (brain.lastThreat > 0.8) return 'PREDATOR_CONTACT';
  return 'UNKNOWN';
}

export function recordOutcome(
  brain: BotBrain | undefined,
  totals: AiTotals,
  outcome: BotOutcome,
  time: number,
  ownerId = 0,
): void {
  if (!brain) return;
  brain.lastOutcomeAt = time;
  pruneMemory(brain, time);
  let quality = 0.35;
  if (outcome === 'escape_success') {
    totals.escapes++;
    quality = 1;
    rememberPoint(brain.recentEscapeDirections, brain.desiredX, brain.desiredY, brain.escapeQuality, time);
  } else if (outcome === 'escape_failure') {
    brain.risk = Math.max(0.35, brain.risk - AI.planning.outcomeRiskStep);
    quality = -0.6;
  } else if (outcome === 'hunt_success') {
    totals.huntsWon++;
    brain.kills++;
    brain.targetCommitment = Math.min(1, brain.targetCommitment + 0.1);
    brain.lastWinReason = brain.lastFreeKill
      ? 'FREE_KILL'
      : brain.pressureScore > 0.5 ? 'INTERCEPT' : 'OPPORTUNISTIC_EAT';
    totals.winReasons[brain.lastWinReason]++;
    brain.recentSuccessfulTargets.push({ ownerId, at: time, value: brain.targetScore });
    quality = 1.1;
  } else if (outcome === 'hunt_failure') {
    totals.huntsFailed++;
    brain.lessons.chase = Math.max(0.55, brain.lessons.chase * 0.9);
    brain.risk = Math.max(0.38, brain.risk - AI.planning.outcomeRiskStep);
    brain.recentFailedTargets.push({ ownerId, at: time, value: brain.targetScore });
    quality = -0.55;
  } else if (outcome === 'split_success') {
    brain.lastWinReason = 'SUCCESSFUL_SPLIT';
    totals.winReasons.SUCCESSFUL_SPLIT++;
    quality = 1.15;
  } else if (outcome === 'split_failure') {
    brain.lessons.split = Math.min(1.5, brain.lessons.split + 0.18);
    brain.risk = Math.max(0.35, brain.risk - AI.planning.outcomeRiskStep);
    quality = -0.65;
  } else if (outcome === 'virus_success') {
    brain.lastWinReason = 'VIRUS_BAIT';
    totals.winReasons.VIRUS_BAIT++;
    quality = 0.8;
  } else if (outcome === 'virus_failure') {
    brain.lessons.virus = Math.min(1.6, brain.lessons.virus + 0.25);
    quality = -0.75;
  } else if (outcome === 'safe_farm') {
    brain.risk = clamp(brain.risk + AI.planning.outcomeRiskStep * 0.2, 0.35, 1.6);
    brain.lastWinReason = 'SAFE_FARM';
    totals.winReasons.SAFE_FARM++;
    quality = 0.42;
  } else if (outcome === 'opportunistic_eat') {
    brain.lastWinReason = 'OPPORTUNISTIC_EAT';
    totals.winReasons.OPPORTUNISTIC_EAT++;
    quality = 0.76;
  }
  totals.decisionQualitySum += quality;
  totals.decisionQualitySamples++;
}

export function recordDeath(brain: BotBrain | undefined, totals: AiTotals, time: number): void {
  if (!brain) return;
  totals.deaths++;
  const reason = classifyDeathReason(brain, time);
  brain.lastDeathReason = reason;
  totals.deathReasons[reason]++;
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

export function recordVirusPop(brain: BotBrain | undefined, totals: AiTotals, time = 0): void {
  if (!brain) return;
  totals.virusPops++;
  brain.lessons.virus = Math.min(1.6, brain.lessons.virus + 0.25);
  recordOutcome(brain, totals, 'virus_failure', time);
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
    decisions: totals.decisions,
    decisionQuality: totals.decisionQualitySamples
      ? totals.decisionQualitySum / totals.decisionQualitySamples
      : 0,
    deathReasons: { ...totals.deathReasons },
    winReasons: { ...totals.winReasons },
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
  timeToIntercept: number;
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
  const timeToIntercept = closing > 4 ? Math.max(0, gap / closing) : Infinity;
  return { score, closing, canEat, splitKill, dist, gap, timeToIntercept };
}

export interface HuntEvaluation {
  successProbability: number;
  timeToIntercept: number;
  interceptX: number;
  interceptY: number;
  targetEscapeX: number;
  targetEscapeY: number;
  escapeQuality: number;
  pressureScore: number;
  noWin: boolean;
}

export interface TacticalPlan {
  action: 'direct' | 'intercept' | 'pressure' | 'disengage' | 'farm' | 'reposition';
  x: number;
  y: number;
  utility: number;
  expectedGrowth: number;
  survivalProbability: number;
  positionQuality: number;
  futureOpportunity: number;
  risk: number;
  interceptX: number;
  interceptY: number;
}

function projectPoint(x: number, y: number, vx: number, vy: number, seconds: number, world: number, radius = 24): { x: number; y: number } {
  let px = x + vx * seconds;
  let py = y + vy * seconds;
  const min = Math.max(18, radius);
  const max = world - min;
  if (px < min) px = min + (min - px) * 0.22;
  if (px > max) px = max - (px - max) * 0.22;
  if (py < min) py = min + (min - py) * 0.22;
  if (py > max) py = max - (py - max) * 0.22;
  return { x: clamp(px, min, max), y: clamp(py, min, max) };
}

function vectorLength(x: number, y: number): number {
  return Math.hypot(x, y) || 1;
}

function directionTo(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number } {
  const length = vectorLength(toX - fromX, toY - fromY);
  return { x: (toX - fromX) / length, y: (toY - fromY) / length };
}

/**
 * Predict a moving target's intercept point with a few bounded iterations.
 * This is intentionally a kinematic forecast, not a hidden look-ahead into
 * the engine: only the target's observed position and velocity are used.
 */
export function predictIntercept(args: {
  selfX: number;
  selfY: number;
  selfSpeed: number;
  selfRadius?: number;
  targetX: number;
  targetY: number;
  targetVx: number;
  targetVy: number;
  targetRadius?: number;
  world: number;
  horizon?: number;
  iterations?: number;
}): {
  x: number;
  y: number;
  time: number;
  targetEscapeX: number;
  targetEscapeY: number;
  escapeQuality: number;
} {
  const horizon = args.horizon ?? AI.planning.predictionHorizon;
  const iterations = Math.max(1, Math.min(8, args.iterations ?? AI.planning.interceptIterations));
  const targetRadius = args.targetRadius ?? 20;
  const selfSpeed = Math.max(20, args.selfSpeed);
  const initialDistance = hypot(args.targetX - args.selfX, args.targetY - args.selfY);
  let time = clamp(initialDistance / selfSpeed, 0.08, horizon);
  let target = projectPoint(args.targetX, args.targetY, args.targetVx, args.targetVy, time, args.world, targetRadius);
  for (let i = 0; i < iterations; i++) {
    const distance = hypot(target.x - args.selfX, target.y - args.selfY);
    const toTarget = directionTo(args.selfX, args.selfY, target.x, target.y);
    const targetOpening = args.targetVx * toTarget.x + args.targetVy * toTarget.y;
    const closingSpeed = Math.max(18, selfSpeed - targetOpening);
    time = clamp(distance / closingSpeed, 0.08, horizon);
    target = projectPoint(args.targetX, args.targetY, args.targetVx, args.targetVy, time, args.world, targetRadius);
  }
  const velocityLength = hypot(args.targetVx, args.targetVy);
  const heading = velocityLength > 12
    ? { x: args.targetVx / velocityLength, y: args.targetVy / velocityLength }
    : directionTo(args.selfX, args.selfY, args.targetX, args.targetY);
  const escapePoint = projectPoint(
    args.targetX,
    args.targetY,
    heading.x * Math.max(55, velocityLength),
    heading.y * Math.max(55, velocityLength),
    1.1,
    args.world,
    targetRadius,
  );
  const edge = Math.min(escapePoint.x, escapePoint.y, args.world - escapePoint.x, args.world - escapePoint.y);
  const escapeQuality = clamp(edge / 520, 0, 1) * (velocityLength > 16 ? 0.82 : 0.68);
  return {
    x: clamp(target.x, 28, args.world - 28),
    y: clamp(target.y, 28, args.world - 28),
    time,
    targetEscapeX: escapePoint.x,
    targetEscapeY: escapePoint.y,
    escapeQuality,
  };
}

/** Estimate a catch before a bot commits to a chase or split. */
export function evaluateHunt(args: {
  selfX: number;
  selfY: number;
  selfMass: number;
  selfSpeed: number;
  selfRadius: number;
  preyX: number;
  preyY: number;
  preyVx: number;
  preyVy: number;
  preyMass: number;
  preyRadius: number;
  world: number;
  threatDanger?: number;
  competitorRisk?: number;
  pressureDistance?: number;
}): HuntEvaluation {
  const prediction = predictIntercept({
    selfX: args.selfX,
    selfY: args.selfY,
    selfSpeed: args.selfSpeed,
    selfRadius: args.selfRadius,
    targetX: args.preyX,
    targetY: args.preyY,
    targetVx: args.preyVx,
    targetVy: args.preyVy,
    targetRadius: args.preyRadius,
    world: args.world,
  });
  const distance = hypot(args.preyX - args.selfX, args.preyY - args.selfY);
  const ratio = args.selfMass / Math.max(1, args.preyMass);
  const massAdvantage = clamp((ratio - BALANCE.eatRatio) / 2.2, 0, 1);
  const proximity = clamp(1 - distance / 1200, 0, 1);
  const radial = directionTo(args.selfX, args.selfY, args.preyX, args.preyY);
  const targetOpening = args.preyVx * radial.x + args.preyVy * radial.y;
  const closing = args.selfSpeed - targetOpening;
  const speedAdvantage = clamp((closing + 40) / Math.max(80, args.selfSpeed + 110), 0, 1);
  const boundaryTrap = 1 - prediction.escapeQuality;
  const threatRisk = clamp(args.threatDanger ?? 0, 0, 4);
  const competitorRisk = clamp(args.competitorRisk ?? 0, 0, 3);
  const reachBonus = prediction.time < 0.75 ? 0.22 : 0;
  const probability = clamp(
    0.06
      + massAdvantage * 0.34
      + proximity * 0.18
      + speedAdvantage * 0.2
      + boundaryTrap * 0.14
      + reachBonus
      - threatRisk * 0.12
      - competitorRisk * 0.1,
    0.02,
    0.98,
  );
  const pressureDistance = args.pressureDistance ?? AI.planning.pressureDistance;
  const pressure = clamp(
    (massAdvantage * 0.42 + speedAdvantage * 0.3 + boundaryTrap * 0.24)
      * clamp(1 - distance / pressureDistance, 0, 1)
      - threatRisk * 0.12
      - competitorRisk * 0.08,
    0,
    1,
  );
  const noWin = probability < AI.planning.noWinProbability
    && distance > args.selfRadius + args.preyRadius + 90;
  return {
    successProbability: probability,
    timeToIntercept: prediction.time,
    interceptX: prediction.x,
    interceptY: prediction.y,
    targetEscapeX: prediction.targetEscapeX,
    targetEscapeY: prediction.targetEscapeY,
    escapeQuality: prediction.escapeQuality,
    pressureScore: pressure,
    noWin,
  };
}

export function classifySituation(args: {
  dangerLevel: number;
  opportunityLevel: number;
  crowdingLevel: number;
  mobilityLevel: number;
  growthPotential: number;
  escapeQuality: number;
  hasThreat: boolean;
  hasPrey: boolean;
  splitOpportunity: boolean;
  virusOpportunity: boolean;
  vulnerable: boolean;
  wallDanger: number;
}): { situation: AiSituation; confidence: number } {
  if (args.vulnerable) return { situation: 'POST_SPLIT_VULNERABILITY', confidence: 0.94 };
  if (args.dangerLevel >= AI.context.emergencyDanger) {
    if (args.mobilityLevel < AI.context.lowMobility || args.escapeQuality < AI.context.lowMobility) {
      return { situation: 'TRAPPED', confidence: 0.92 };
    }
    if (args.crowdingLevel >= AI.context.crowdDanger) return { situation: 'MULTI_THREAT', confidence: 0.9 };
    return { situation: 'PREDATOR_NEAR', confidence: 0.9 };
  }
  if (args.crowdingLevel >= AI.context.crowdDanger && args.dangerLevel > AI.context.safeDanger) {
    return { situation: 'MULTI_THREAT', confidence: 0.82 };
  }
  if (args.crowdingLevel >= AI.context.crowdDanger) return { situation: 'CROWDED', confidence: 0.78 };
  if (args.virusOpportunity && args.dangerLevel < AI.context.safeDanger) {
    return { situation: 'VIRUS_OPPORTUNITY', confidence: 0.72 };
  }
  if (args.splitOpportunity && args.opportunityLevel >= AI.context.goodOpportunity && args.dangerLevel < AI.context.emergencyDanger) {
    return { situation: 'SPLIT_OPPORTUNITY', confidence: 0.82 };
  }
  if (args.hasPrey && args.opportunityLevel >= AI.context.goodOpportunity) {
    return { situation: 'CHASE_OPPORTUNITY', confidence: 0.8 };
  }
  if (args.hasThreat && args.dangerLevel > AI.context.safeDanger) {
    return { situation: 'DANGEROUS_FARM', confidence: 0.76 };
  }
  if (args.hasThreat && args.escapeQuality >= AI.context.goodEscape) {
    return { situation: 'ESCAPE_WINDOW', confidence: 0.68 };
  }
  if (args.wallDanger > 0.62 || args.mobilityLevel < AI.context.lowMobility) {
    return { situation: 'RECOVERY', confidence: 0.72 };
  }
  if (args.growthPotential > 0.75) return { situation: 'SAFE_FARM', confidence: 0.74 };
  return { situation: 'PREY_NEAR', confidence: 0.55 };
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
  crowd?: Array<Pick<Cell, 'x' | 'y' | 'mass' | 'radius'>>;
}): { x: number; y: number; score: number; quality: number; corridorX: number; corridorY: number; timeToSafety: number } {
  const headings = Math.max(6, AI.performance.headings);
  const jitter = (unitHash((args.ownerId ?? 1) * 17 + Math.floor((args.time ?? 0) * 2)) - 0.5) * 0.2;
  const fear = args.virusFear ?? 1;
  const lesson = args.boundaryLesson ?? 0;
  const pops = args.mass >= BALANCE.virusTriggerMass * AI.virus.fearScale;
  const currentWall = boundaryDanger(args.x, args.y, args.world, AI.flee.wallMargin);
  const relevantVirus = args.viruses.some(virus => {
    const distance = hypot(virus.x - args.x, virus.y - args.y);
    return (virus.mother && args.mass < BALANCE.motherDigestMass)
      || (!virus.mother && pops && distance < virus.radius + args.radius + 80);
  });
  if (!args.threats.length && !relevantVirus && currentWall < 0.22 && (args.crowd?.length ?? 0) < 10) {
    const angle = unitHash((args.ownerId ?? 1) * 29 + Math.floor((args.time ?? 0) * 1.5)) * TAU;
    const targetX = clamp(args.x + Math.cos(angle) * AI.flee.aimDistance, 48, args.world - 48);
    const targetY = clamp(args.y + Math.sin(angle) * AI.flee.aimDistance, 48, args.world - 48);
    return { x: targetX, y: targetY, score: 1.5, quality: 0.9, corridorX: targetX, corridorY: targetY, timeToSafety: 0 };
  }
  let best = -Infinity;
  let bestQuality = 0;
  let bestX = args.x;
  let bestY = args.y;
  let bestTime = AI.flee.lookahead[AI.flee.lookahead.length - 1] / Math.max(70, args.speed);
  const primary = args.threats[0];
  for (let i = 0; i < headings; i++) {
    const angle = (i / headings) * TAU + jitter;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let score = 0;
    let clearance = Infinity;
    let routeDanger = 0;
    for (const distance of AI.flee.lookahead) {
      const horizon = distance / Math.max(70, args.speed);
      const rawX = args.x + dx * distance;
      const rawY = args.y + dy * distance;
      const px = clamp(rawX, 20, args.world - 20);
      const py = clamp(rawY, 20, args.world - 20);
      const shoved = hypot(px - rawX, py - rawY);
      if (shoved > 8) score -= 6 + shoved * 0.03;
      const edge = boundaryDanger(px, py, args.world, AI.flee.wallMargin);
      score -= edge * edge * (16 + lesson * 10) * (distance / 340);
      routeDanger += edge * 0.42;
      for (const threat of args.threats) {
        const predicted = projectPoint(threat.x, threat.y, threat.vx, threat.vy, horizon, args.world, threat.radius);
        const threatDistance = hypot(px - predicted.x, py - predicted.y);
        const dangerR = threat.radius + args.radius + 90;
        clearance = Math.min(clearance, threatDistance - dangerR);
        if (threatDistance < dangerR) score -= (1 - threatDistance / dangerR) * (10 + threat.score * 7);
        else score += Math.min(2.7, (threatDistance - dangerR) / 180) * (0.4 + threat.score * 0.15);
        const awayX = px - predicted.x;
        const awayY = py - predicted.y;
        const awayLength = vectorLength(awayX, awayY);
        score += (awayX * dx + awayY * dy) / awayLength * Math.min(1.7, threat.score * 0.42);
      }
      const crowdPoints = args.crowd ?? [];
      for (let crowdIndex = 0; crowdIndex < crowdPoints.length; crowdIndex++) {
        const point = crowdPoints[crowdIndex];
        const crowdDistance = hypot(px - point.x, py - point.y);
        if (crowdDistance < args.radius + point.radius + 70 && point.mass < args.mass * 1.4) {
          score -= (1 - crowdDistance / (args.radius + point.radius + 70)) * 1.2;
        }
      }
      for (const virus of args.viruses) {
        const virusDistance = hypot(px - virus.x, py - virus.y);
        if (virus.mother && args.mass < BALANCE.motherDigestMass) {
          const dangerR = virus.radius + args.radius + 70;
          if (virusDistance < dangerR) score -= (1 - virusDistance / dangerR) * 8;
        } else if (!virus.mother && pops) {
          const dangerR = virus.radius + args.radius + 36;
          if (virusDistance < dangerR) score -= (1 - virusDistance / dangerR) * 7 * fear * (1 + lesson * 0.15);
        }
      }
    }
    if (primary) {
      const away = ((args.x - primary.x) * dx + (args.y - primary.y) * dy) / (primary.dist || 1);
      score += away * 3.6;
    }
    if (boundaryDanger(args.x, args.y, args.world, AI.flee.wallMargin) > 0.22) {
      const center = ((args.world / 2 - args.x) * dx + (args.world / 2 - args.y) * dy) / args.world;
      score += center * 4.4;
    }
    const safeClearance = Number.isFinite(clearance) ? clamp(clearance / 520, 0, 1) : 0.75;
    const quality = clamp(safeClearance * (1 - routeDanger / AI.flee.lookahead.length), 0, 1);
    score += quality * 2.8;
    if (score > best) {
      best = score;
      bestQuality = quality;
      bestX = clamp(args.x + dx * AI.flee.aimDistance, 48, args.world - 48);
      bestY = clamp(args.y + dy * AI.flee.aimDistance, 48, args.world - 48);
      bestTime = AI.flee.lookahead[AI.flee.lookahead.length - 1] / Math.max(70, args.speed);
    }
  }
  if (!Number.isFinite(bestX) || !Number.isFinite(bestY)) {
    return { x: args.x, y: args.y, score: 0, quality: 0, corridorX: args.x, corridorY: args.y, timeToSafety: 0 };
  }
  return { x: bestX, y: bestY, score: best, quality: bestQuality, corridorX: bestX, corridorY: bestY, timeToSafety: bestTime };
}

/** Evaluate a handful of future routes instead of committing to the first visible prey. */
export function planTacticalActions(args: {
  selfX: number;
  selfY: number;
  selfSpeed: number;
  selfMass: number;
  selfRadius: number;
  world: number;
  prey?: { x: number; y: number; vx: number; vy: number; mass: number; radius: number; evaluation: HuntEvaluation };
  food?: { x: number; y: number; score: number };
  threats: Array<Pick<ThreatInfo, 'x' | 'y' | 'vx' | 'vy' | 'mass' | 'radius' | 'score'>>;
  escape: { x: number; y: number; quality: number };
  viruses?: Array<Pick<Virus, 'x' | 'y' | 'radius' | 'mother'>>;
  crowd?: Array<Pick<Cell, 'x' | 'y' | 'mass' | 'radius'>>;
  dangerLevel: number;
  crowdingLevel: number;
  /** 1 for combat focus, less than 1 for far/irrelevant LOD. */
  detail?: number;
}): TacticalPlan {
  const detail = clamp(args.detail ?? 1, 0.35, 1);
  if (!args.prey && !args.threats.length && args.food && args.dangerLevel < AI.context.safeDanger && args.crowdingLevel < AI.context.crowdDanger) {
    return {
      action: 'farm', x: args.food.x, y: args.food.y, utility: args.food.score * 8,
      expectedGrowth: args.food.score * 14, survivalProbability: 0.96, positionQuality: 0.86,
      futureOpportunity: args.food.score, risk: 0.08, interceptX: args.selfX, interceptY: args.selfY,
    };
  }
  const candidates: Array<{ action: TacticalPlan['action']; x: number; y: number; growth: number; future: number }> = [];
  if (args.prey) {
    const prey = args.prey;
    const direct = directionTo(args.selfX, args.selfY, prey.x, prey.y);
    const perpendicular = { x: -direct.y, y: direct.x };
    candidates.push(
      { action: 'direct', x: prey.x, y: prey.y, growth: prey.mass * prey.evaluation.successProbability, future: 0.18 },
      { action: 'intercept', x: prey.evaluation.interceptX, y: prey.evaluation.interceptY, growth: prey.mass * (prey.evaluation.successProbability + 0.08), future: 0.3 },
      { action: 'pressure', x: prey.evaluation.interceptX + perpendicular.x * 110, y: prey.evaluation.interceptY + perpendicular.y * 110, growth: prey.mass * prey.evaluation.pressureScore * 0.72, future: 0.46 },
    );
  }
  if (args.food) candidates.push({ action: 'farm', x: args.food.x, y: args.food.y, growth: args.food.score * 14, future: 0.35 });
  candidates.push(
    { action: 'disengage', x: args.escape.x, y: args.escape.y, growth: 0, future: args.escape.quality * 1.6 },
    { action: 'reposition', x: args.world / 2, y: args.world / 2, growth: 0, future: 0.45 },
  );
  let best: TacticalPlan | null = null;
  const samples = Math.max(2, Math.round(AI.performance.tacticalSamples * detail));
  const threatLimit = Math.min(args.threats.length, args.prey ? (detail < 0.8 ? 3 : 5) : 2);
  const virusLimit = Math.min((args.viruses ?? []).length, args.prey ? (detail < 0.8 ? 5 : 8) : 4);
  const crowdLimit = Math.min((args.crowdingLevel > 0 ? 24 : 0), args.prey ? (detail < 0.8 ? 8 : 12) : 5);
  for (const candidate of candidates) {
    const direction = directionTo(args.selfX, args.selfY, candidate.x, candidate.y);
    let danger = 0;
    for (let sample = 1; sample <= samples; sample++) {
      const t = AI.performance.tacticalHorizon * sample / samples;
      const px = clamp(args.selfX + direction.x * args.selfSpeed * t, args.selfRadius, args.world - args.selfRadius);
      const py = clamp(args.selfY + direction.y * args.selfSpeed * t, args.selfRadius, args.world - args.selfRadius);
      const wall = boundaryDanger(px, py, args.world, AI.flee.wallMargin);
      danger += wall * 0.72;
      for (let threatIndex = 0; threatIndex < threatLimit; threatIndex++) {
        const threat = args.threats[threatIndex];
        const projected = projectPoint(threat.x, threat.y, threat.vx, threat.vy, t, args.world, threat.radius);
        const d = hypot(px - projected.x, py - projected.y);
        const safe = threat.radius + args.selfRadius + 80;
        if (d < safe) danger += (1 - d / safe) * (0.85 + threat.score * 0.38);
      }
      for (let virusIndex = 0; virusIndex < virusLimit; virusIndex++) {
        const virus = args.viruses![virusIndex];
        const d = hypot(px - virus.x, py - virus.y);
        if (!virus.mother && args.selfMass >= BALANCE.virusTriggerMass && d < virus.radius + args.selfRadius + 42) danger += 0.42;
        if (virus.mother && d < virus.radius + args.selfRadius + 72) danger += 0.32;
      }
      const crowdPoints = args.crowd ?? [];
      for (let crowdIndex = 0; crowdIndex < Math.min(crowdPoints.length, crowdLimit); crowdIndex++) {
        const point = crowdPoints[crowdIndex];
        const d = hypot(px - point.x, py - point.y);
        if (d < args.selfRadius + point.radius + 70 && point.mass < args.selfMass * 1.4) {
          danger += (1 - d / (args.selfRadius + point.radius + 70)) * 0.18;
        }
      }
    }
    const averageDanger = danger / samples;
    const survivalProbability = clamp(Math.exp(-(averageDanger + args.dangerLevel * 0.32)), 0.02, 1);
    const positionQuality = clamp(
      0.58 + (1 - boundaryDanger(candidate.x, candidate.y, args.world, AI.flee.wallMargin)) * 0.32
        - args.crowdingLevel * 0.018,
      0,
      1,
    );
    const risk = averageDanger * 3.2 + args.dangerLevel * 0.65;
    const utility = candidate.growth * survivalProbability * positionQuality
      + candidate.future * 4.2
      + survivalProbability * 1.2
      - risk;
    const plan: TacticalPlan = {
      action: candidate.action,
      x: clamp(candidate.x, 30, args.world - 30),
      y: clamp(candidate.y, 30, args.world - 30),
      utility,
      expectedGrowth: candidate.growth,
      survivalProbability,
      positionQuality,
      futureOpportunity: candidate.future,
      risk,
      interceptX: args.prey?.evaluation.interceptX ?? args.selfX,
      interceptY: args.prey?.evaluation.interceptY ?? args.selfY,
    };
    if (!best || plan.utility > best.utility) best = plan;
  }
  return best ?? {
    action: 'disengage', x: args.escape.x, y: args.escape.y, utility: 0,
    expectedGrowth: 0, survivalProbability: args.escape.quality, positionQuality: args.escape.quality,
    futureOpportunity: 0, risk: 0, interceptX: args.selfX, interceptY: args.selfY,
  };
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
  competitorRisk?: number;
  predict: number;
  splitUrge: number;
}): {
  score: number;
  aimX: number;
  aimY: number;
  freeKill: boolean;
  canSplit: boolean;
  dist: number;
  catchable: boolean;
  successProbability: number;
  timeToIntercept: number;
  escapeQuality: number;
  pressureScore: number;
  competitorRisk: number;
  interceptX: number;
  interceptY: number;
  targetEscapeX: number;
  targetEscapeY: number;
} | null {
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
  const evaluation = evaluateHunt({
    selfX: args.selfX,
    selfY: args.selfY,
    selfMass: args.selfMass,
    selfSpeed: args.selfSpeed,
    selfRadius: args.selfRadius,
    preyX: args.preyX,
    preyY: args.preyY,
    preyVx: args.preyVx,
    preyVy: args.preyVy,
    preyMass: args.preyMass,
    preyRadius: args.preyRadius,
    world: args.world,
    threatDanger: args.threatDanger,
    competitorRisk: args.competitorRisk,
  });
  // An impossible chase is not a valid opportunity. Close targets are kept
  // because a split or a pressure move can still convert them.
  if (evaluation.noWin && !canSplit && dist > AI.planning.pressureDistance) return null;
  let aimX = evaluation.interceptX;
  let aimY = evaluation.interceptY;
  if (args.predict < 0.8) {
    aimX = args.preyX * (1 - args.predict) + aimX * args.predict;
    aimY = args.preyY * (1 - args.predict) + aimY * args.predict;
  }
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
  score *= 0.56 + evaluation.successProbability * 0.8;
  score *= 1 + clamp((ratio - 1.25) / 5, 0, 0.7);
  if (canSplit && dist < reach) score += 0.35 * args.splitUrge;
  score += evaluation.pressureScore * 0.65;
  score -= args.threatDanger * 2.4;
  score -= (args.competitorRisk ?? 0) * 0.8;
  const trap = boundaryDanger(aimX, aimY, args.world, 240);
  score -= trap * 1.7;
  if (trap > 0.62 && boundaryDanger(args.selfX, args.selfY, args.world, 240) < 0.3) score -= 1.6;
  if (!catchable && !canSplit) score *= 0.35;
  const freeKill = canEat && ratio >= AI.hunt.freeKillRatio && dist < AI.hunt.freeKillDist
    && args.threatDanger < 0.35 && (args.competitorRisk ?? 0) < 0.35
    && catchable && trap < 0.55;
  if (freeKill) score += 1.1;
  return {
    score,
    aimX,
    aimY,
    freeKill,
    canSplit,
    dist,
    catchable,
    successProbability: evaluation.successProbability,
    timeToIntercept: evaluation.timeToIntercept,
    escapeQuality: evaluation.escapeQuality,
    pressureScore: evaluation.pressureScore,
    competitorRisk: args.competitorRisk ?? 0,
    interceptX: evaluation.interceptX,
    interceptY: evaluation.interceptY,
    targetEscapeX: evaluation.targetEscapeX,
    targetEscapeY: evaluation.targetEscapeY,
  };
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
  successProbability?: number;
  competitorRisk?: number;
  escapeQuality?: number;
}): { yes: boolean; risky: boolean; confidence?: number; landX?: number; landY?: number } {
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
  const futureRisk = (args.competitorRisk ?? 0) * 0.32 + (1 - (args.escapeQuality ?? 0.82)) * 0.24;
  if ((args.successProbability ?? 0.8) < 0.28 && futureRisk > 0.32) return { yes: false, risky: true, confidence: 0.18, landX, landY };
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
  const confidence = args.splitUrge * args.splitBias * (1 - args.splitLesson * 0.45)
    * (0.72 + (args.successProbability ?? 0.8) * 0.34)
    * (1 - futureRisk * 0.36);
  if (args.preyMass * confidence < AI.split.minReward) return { yes: false, risky: false, confidence, landX, landY };
  if (confidence < 0.22) return { yes: false, risky: false, confidence, landX, landY };
  return { yes: true, risky: false, confidence, landX, landY };
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

export function shouldSwitchTarget(currentScore: number, challengerScore: number, margin: number = AI.hunt.switchMargin): boolean {
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
      timeToIntercept: best.timeToIntercept,
      approach: best.closing,
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
      if (threat.ownerId === other.owner) continue;
      if (hypot(threat.x - other.x, threat.y - other.y) < 420 && threat.mass > other.mass * BALANCE.eatRatio * 0.95) {
        threatDanger += threat.score * 0.85;
      }
    }
    // A rival fighting the prey is an opportunity, but also a third-party risk.
    // It is bounded to the already perceived local cells; no global knowledge.
    let competitorRisk = 0;
    const inspectCompetition = other.id === brain.targetCellId || other.mass > self.largestMass * 0.14;
    const competitorLimit = Math.min(cells.length, 20);
    for (let competitorIndex = 0; inspectCompetition && competitorIndex < competitorLimit; competitorIndex++) {
      const competitor = cells[competitorIndex];
      if (!competitor.alive || competitor.owner === owner.id || competitor.owner === other.owner) continue;
      if (mode === 'teams') {
        const competitorOwner = ownerOf(competitor.owner);
        if (competitorOwner?.team === owner.team) continue;
      }
      const competitorDistance = hypot(competitor.x - other.x, competitor.y - other.y);
      if (competitorDistance > 430 || competitor.mass < other.mass * BALANCE.eatRatio) continue;
      competitorRisk += clamp((1 - competitorDistance / 430) * (competitor.mass / Math.max(1, self.largestMass)), 0, 1.25);
    }
    const scored = scorePrey({
      selfX: self.x, selfY: self.y, selfMass: self.largestMass, selfRadius: self.radius, selfSpeed: self.speed,
      preyX: other.x, preyY: other.y, preyVx: pvx, preyVy: pvy,
      preyMass: other.mass, preyRadius: other.radius,
      perception, world, threatDanger, competitorRisk, predict, splitUrge: personality.split,
    });
    if (!scored) continue;
    let score = scored.score;
    if (competitorRisk > 0.35 && personality.chase < 1) score *= 0.72;
    if (other.id === brain.targetCellId) {
      const stalled = time - brain.lastProgressAt;
      const chasing = time - brain.chaseSince;
      if (scored.successProbability < AI.planning.noWinProbability && chasing > AI.planning.noWinGrace) {
        brain.abandonOwner = other.owner;
        brain.abandonUntil = time + AI.memory.abandonSeconds;
        score *= 0.08;
      } else if (chasing > personality.persistence * brain.lessons.chase && stalled > AI.hunt.abandonProgress) {
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
      successProbability: scored.successProbability,
      timeToIntercept: scored.timeToIntercept,
      escapeQuality: scored.escapeQuality,
      pressureScore: scored.pressureScore,
      competitorRisk,
      interceptX: scored.interceptX,
      interceptY: scored.interceptY,
      targetEscapeX: scored.targetEscapeX,
      targetEscapeY: scored.targetEscapeY,
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
  const commitmentMargin = AI.hunt.switchMargin + brain.targetCommitment * AI.planning.commitmentBonus;
  if (locked && best && locked.id !== best.id && !shouldSwitchTarget(locked.score, best.score, commitmentMargin)) return locked;
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

function separation(self: SelfView, cells: Cell[], ownerId: number): {
  x: number;
  y: number;
  crowd: number;
  points: Array<Pick<Cell, 'x' | 'y' | 'mass' | 'radius'>>;
} {
  let sx = 0;
  let sy = 0;
  let crowd = 0;
  const points: Array<Pick<Cell, 'x' | 'y' | 'mass' | 'radius'>> = [];
  for (const cell of cells) {
    if (cell.owner === ownerId) continue;
    const dx = self.x - cell.x;
    const dy = self.y - cell.y;
    const dist = hypot(dx, dy);
    if (dist < 320) crowd++;
    if (dist < 620 && points.length < 24) points.push(cell);
    const ratio = cell.mass / Math.max(1, self.largestMass);
    if (dist > 1 && dist < self.radius + cell.radius + 36 && ratio > 0.75 && ratio < 1.35) {
      sx += dx / dist * 28;
      sy += dy / dist * 28;
    }
  }
  return { x: sx, y: sy, crowd, points };
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
  const space = separation(self, input.cells, owner.id);
  const escape = chooseEscape({
    x: self.x, y: self.y, speed: self.speed, radius: self.radius, mass: self.mass, world,
    threats, viruses: nearbyViruses, virusFear: personality.virusFear * (1 + brain.lessons.virus * 0.4),
    boundaryLesson: brain.lessons.boundary, ownerId: owner.id, time, crowd: space.points,
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

  const dangerLevel = clamp(
    (active?.score ?? 0) + surround * 0.38 + virusHazard * 0.72 + wall * 0.32,
    0,
    4,
  );
  const crowdingLevel = space.crowd;
  const growthPotential = clamp((food?.score ?? 0) / 2.4, 0, 1);
  const mobilityLevel = clamp(escape.quality * (1 - Math.min(0.42, crowdingLevel * 0.018)) + (1 - wall) * 0.12, 0, 1);
  const opportunityLevel = Math.max(
    prey ? prey.score * (0.65 + prey.successProbability * 0.55) : 0,
    food ? food.score : 0,
  );
  const situationResult = classifySituation({
    dangerLevel,
    opportunityLevel,
    crowdingLevel,
    mobilityLevel,
    growthPotential,
    escapeQuality: escape.quality,
    hasThreat: !!active,
    hasPrey: !!prey,
    splitOpportunity: !!prey?.canSplit && prey.successProbability > 0.52,
    virusOpportunity: virus.baitScore > 0.7 || virus.feedAngle !== null,
    vulnerable: time < brain.vulnerableUntil,
    wallDanger: wall,
  });
  const huntEvaluation = prey ? {
    successProbability: prey.successProbability,
    timeToIntercept: prey.timeToIntercept,
    interceptX: prey.interceptX,
    interceptY: prey.interceptY,
    targetEscapeX: prey.targetEscapeX,
    targetEscapeY: prey.targetEscapeY,
    escapeQuality: prey.escapeQuality,
    pressureScore: prey.pressureScore,
    noWin: prey.successProbability < AI.planning.noWinProbability,
  } : undefined;
  const tactical = planTacticalActions({
    selfX: self.x,
    selfY: self.y,
    selfSpeed: self.speed,
    selfMass: self.mass,
    selfRadius: self.radius,
    world,
    prey: prey && huntEvaluation ? {
      x: prey.x, y: prey.y, vx: prey.vx, vy: prey.vy,
      mass: prey.mass, radius: prey.radius, evaluation: huntEvaluation,
    } : undefined,
    food: food ? { x: food.x, y: food.y, score: food.score } : undefined,
    threats,
    escape,
    viruses: nearbyViruses,
    crowd: space.points,
    dangerLevel,
    crowdingLevel,
    detail: input.focusDist > AI.performance.farDistance ? 0.5 : 1,
  });
  brain.situation = situationResult.situation;
  brain.dangerLevel = dangerLevel;
  brain.opportunityLevel = opportunityLevel;
  brain.crowdingLevel = crowdingLevel;
  brain.mobilityLevel = mobilityLevel;
  brain.growthPotential = growthPotential;
  brain.escapeQuality = escape.quality;
  brain.strategyConfidence = situationResult.confidence;
  brain.targetScore = prey?.score ?? 0;
  brain.interceptX = prey?.interceptX ?? self.x;
  brain.interceptY = prey?.interceptY ?? self.y;
  brain.targetEscapeX = huntEvaluation?.targetEscapeX ?? self.x;
  brain.targetEscapeY = huntEvaluation?.targetEscapeY ?? self.y;
  brain.timeToIntercept = prey?.timeToIntercept ?? Infinity;
  brain.huntProbability = prey?.successProbability ?? 0;
  brain.pressureScore = prey?.pressureScore ?? 0;
  brain.lastFreeKill = prey?.freeKill ?? false;
  if (active) rememberDanger(brain, active.x, active.y, active.score, time);

  let huntScore = 0;
  let stalkScore = 0;
  if (prey) {
    huntScore = prey.score * personality.chase * size.hunt * brain.lessons.chase
      * (0.72 + brain.risk * 0.34) * (0.62 + prey.successProbability * 0.58);
    if (tactical.action === 'intercept') huntScore += 0.38 + prey.pressureScore * 0.32;
    if (tactical.action === 'pressure') huntScore += prey.pressureScore * 0.56;
    if (tactical.action === 'disengage' && !prey.freeKill) huntScore *= 0.58;
    if (prey.freeKill && !lethal) huntScore = Math.max(huntScore, 3.85);
    if (prey.successProbability < AI.planning.noWinProbability && !prey.freeKill) huntScore *= 0.18;
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
    const plannedAim = tactical.action === 'intercept' || tactical.action === 'pressure'
      ? { x: tactical.x, y: tactical.y }
      : { x: prey.aimX, y: prey.aimY };
    x = plannedAim.x + px * side * (strategy === 'stalk' ? 1 : 0.25);
    y = plannedAim.y + py * side * (strategy === 'stalk' ? 1 : 0.25);
    if (strategy === 'stalk') {
      x = self.x * 0.35 + x * 0.65;
      y = self.y * 0.35 + y * 0.65;
    }
    note = `${strategy}:${prey.ownerId}:${situationResult.situation}`;
    if (brain.targetCellId !== prey.id) {
      brain.targetCellId = prey.id;
      brain.targetOwnerId = prey.ownerId;
      brain.targetCommitment = 0.46;
      brain.targetSeenAt = time;
      brain.chaseSince = time;
      brain.bestChaseDist = prey.dist;
      brain.lastProgressAt = time;
    } else {
      brain.targetCommitment = clamp(brain.targetCommitment + 0.045, 0, 1);
      brain.targetSeenAt = time;
      if (prey.dist < brain.bestChaseDist - 12) {
        brain.bestChaseDist = prey.dist;
        brain.lastProgressAt = time;
      }
    }
  } else if (strategy === 'farm' && food) {
    x = food.x;
    y = food.y;
    brain.foodX = food.x;
    brain.foodY = food.y;
    brain.foodScore = food.score;
    brain.foodUntil = time + AI.farm.keepSeconds;
    rememberFarmRegion(brain, food.x, food.y, food.score, time);
    brain.targetCommitment = Math.max(0, brain.targetCommitment - AI.planning.commitmentDecay);
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
    if (stalled || lethal || (prey?.successProbability ?? 1) < AI.planning.noWinProbability) {
      abandoned = true;
      brain.abandonOwner = brain.targetOwnerId;
      brain.abandonUntil = time + AI.memory.abandonSeconds;
      brain.lessons.chase = Math.max(0.6, brain.lessons.chase * 0.98);
      brain.risk = Math.max(0.38, brain.risk - AI.planning.outcomeRiskStep);
      brain.recentFailedTargets.push({ ownerId: brain.targetOwnerId, at: time, value: brain.targetScore });
    }
    brain.targetCommitment = Math.max(0, brain.targetCommitment - 0.34);
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
      successProbability: prey.successProbability,
      competitorRisk: prey.competitorRisk,
      escapeQuality: prey.escapeQuality,
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
  const urgent = panic || lethal || strategy === 'flee' || situationResult.situation === 'TRAPPED';
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
    situation: situationResult.situation,
    confidence: clamp(situationResult.confidence * (0.78 + brain.strategyConfidence * 0.22), 0, 1),
    targetId: prey?.id ?? 0,
    timeToIntercept: prey?.timeToIntercept ?? Infinity,
    huntProbability: prey?.successProbability ?? 0,
    escapeQuality: escape.quality,
    crowding: crowdingLevel,
    opportunity: opportunityLevel,
  };
}
