/**
 * Central balance configuration — the single place where gameplay numbers live.
 *
 * Design rule: no other module may hard-code a gameplay constant. A designer
 * should be able to rebalance the game by editing this file only.
 */

/** Radius grows with the square root of mass so giants stay manageable. */
export const massRadius = (mass: number): number =>
  Math.sqrt(Math.max(0.0001, mass)) * BALANCE.radiusFactor;

/**
 * Heavier cells move slower. The exponent is steeper than a linear fade so
 * small cells feel quick and giants feel heavy, without stalling either.
 * Tuned so a fresh 40-mass cell still cruises at about 230 px/s.
 */
export const cellSpeed = (mass: number): number =>
  BALANCE.baseSpeed * Math.pow(Math.max(BALANCE.speedFloorMass, mass), BALANCE.speedExponent);

/** Distance an impulse travels before exponential drag eats it. */
export const impulseTravel = (impulse: number, decay: number, seconds = 0.55): number => {
  const drag = Math.max(0.0001, decay);
  return Math.max(0, impulse) / drag * (1 - Math.exp(-drag * seconds));
};

/** Camera zoom derived from total controlled mass. */
export const zoomForMass = (mass: number): number => {
  const t = Math.max(BALANCE.startMass, mass) / BALANCE.startMass;
  return BALANCE.zoomBase / Math.pow(t, BALANCE.zoomExponent);
};

/** How long split fragments refuse to merge, scaled by fragment mass. */
export const mergeDelay = (mass: number): number =>
  BALANCE.mergeBase + mass * BALANCE.mergePerMass;

export const BALANCE = {
  // -- World ---------------------------------------------------------------
  worldSize: 4800,
  botCount: 48,
  foodCount: 2900,
  virusCount: 24,
  maxViruses: 38,
  motherCells: 5,

  // -- Mass / radius --------------------------------------------------------
  radiusFactor: 5,
  startMass: 40,
  botMinMass: 25,
  botMaxMass: 465,
  eliteBotCount: 10,
  eliteBotTopMass: 1540,
  eliteBotStep: 115,

  // -- Movement ---------------------------------------------------------------
  /** ~230 px/s at start mass. See cellSpeed. */
  baseSpeed: 481,
  speedExponent: -0.2,
  speedFloorMass: 20,
  /** Exponential drag on split / eject impulses. Shared with AI reach estimates. */
  impulseDecay: 3.4,
  ejectDecay: 3.5,

  // -- Eating -----------------------------------------------------------------
  /** Attacker must be at least this much heavier (multiplier) to eat a cell. */
  eatRatio: 1.18,
  /** Overlap rule: dist < big.radius - small.radius * overlapFactor. */
  eatOverlapFactor: 0.33,
  /** Ejected blobs are edible once the eater is this much heavier. */
  ejectEatRatio: 1.15,

  // -- Split ------------------------------------------------------------------
  minSplitMass: 40,
  maxFragments: 16,
  splitImpulse: 800,
  splitCooldown: 12,

  // -- Merge ------------------------------------------------------------------
  mergeBase: 14,
  mergePerMass: 0.014,
  mergeOverlap: 0.8,
  virusMergeDelay: 22,

  // -- Eject ------------------------------------------------------------------
  minEjectMass: 36,
  ejectCost: 12,
  ejectMass: 10,
  ejectImpulse: 530,
  ejectCooldown: 0.16,
  ejectLifetime: 100,
  ejectPickupDelay: 0.7,
  maxEjected: 350,

  // -- Virus ------------------------------------------------------------------
  virusRadius: 58,
  motherRadius: 105,
  virusTriggerMass: 165,
  motherTriggerMass: 520,
  motherDigestMass: 350,
  virusBonusMass: 65,
  motherBonusMass: 100,
  virusFeedThreshold: 7,
  virusMinBurstMass: 28,
  motherEmissionInterval: 0.7,
  motherEmissionCount: 3,

  // -- Decay ------------------------------------------------------------------
  decayStartMass: 180,
  decayRate: 0.0026,

  // -- Protection / respawn ----------------------------------------------------
  spawnProtection: 5,
  botProtection: 2,
  respawnDelay: 2.5,

  // -- Simulation ---------------------------------------------------------------
  fixedStep: 1 / 60,
  maxFrameDt: 0.25,
  appFrameDt: 0.04,

  // -- Camera -------------------------------------------------------------------
  zoomBase: 1.22,
  zoomExponent: 0.21,
  zoomMin: 0.26,
  zoomMax: 1.22,
  zoomOffsetMin: 0.65,
  zoomOffsetMax: 1.35,
  cameraSmoothing: 5,

  // -- AI (legacy mirrors — runtime reads `AI` below) -------------------------
  aiThinkMin: 0.18,
  aiThinkJitter: 0.14,
  aiPerception: 1020,
  aiFleeMargin: 320,
  aiFoodSearch: 540,
  aiFleeRatio: 1.12,
  aiChaseRatio: 1.2,
  aiSplitRatio: 2.15,
  aiSplitRange: 210,
  aiFarDistance: 1650,

  // -- Presentation ---------------------------------------------------------------
  maxParticles: 160,
  maxFloaters: 40,
  pelletMinMass: 1.2,
  pelletBonusMass: 0.8,
} as const;

export type BalanceKey = keyof typeof BALANCE;

/**
 * Bot AI tuning. Grouped so a pass on threat, hunting or flee does not
 * require hunting through gameplay code. Archetype weights are below.
 */
export const AI = {
  perception: {
    base: 1020,
    min: 580,
    max: 1360,
    /** Seconds before a newly seen threat is acted on. Scaled per archetype. */
    reactionBase: 0.15,
    /** Positional noise as a fraction of distance. Zero inside close range. */
    noise: 0.045,
    noiseMinDist: 190,
    /** Gap inside which a lethal cell skips reaction delay. */
    emergencyGap: 108,
  },
  performance: {
    thinkMin: 0.18,
    thinkJitter: 0.14,
    farDistance: 1650,
    lodFactor: 1.65,
    maxThreats: 8,
    maxPrey: 6,
    maxFood: 120,
    foodRadius: 560,
    headings: 12,
  },
  threat: {
    /** Score at which a reacted threat is treated as immediately dangerous. */
    lethalScore: 1.05,
    panicGap: 108,
    surroundRadius: 460,
    ignoreScore: 0.3,
    ignoreGap: 250,
  },
  flee: {
    lookahead: [150, 340, 560],
    aimDistance: 500,
    wallMargin: 360,
    minDuration: 0.46,
  },
  hunt: {
    freeKillRatio: 2.2,
    freeKillDist: 460,
    abandonProgress: 1.2,
    switchMargin: 1.34,
    minDuration: 0.6,
    minPreyMass: 14,
  },
  farm: {
    bucket: 160,
    minDuration: 0.36,
    keepSeconds: 0.62,
    keepMargin: 0.8,
  },
  split: {
    /** Bots may split again quickly; the decision, not a long lockout, gates it. */
    cooldown: 0.5,
    horizon: 0.5,
    maxPiecesCautious: 2,
    maxPiecesBold: 4,
    minReward: 22,
  },
  virus: {
    fearScale: 0.86,
    baitScale: 0.78,
    feedAlign: 0.55,
    feedRange: 220,
    baitRange: 700,
    feedThreatDist: 440,
  },
  movement: {
    aimRate: 4.6,
    aimUrgent: 12,
    stuckTime: 1.3,
    stuckMove: 24,
    stuckTarget: 78,
  },
  hysteresis: {
    margin: 0.2,
    absolute: 0.28,
    override: 1.7,
    lockSwitches: 6,
    lockWindow: 2.5,
    lockDuration: 1.3,
  },
  memory: {
    avoidSeconds: 3.6,
    abandonSeconds: 2.4,
    spawnCaution: 4.2,
    fleeMax: 7.5,
  },
  /** Mass bands. Strategy weights shift as a bot grows; physics does not. */
  size: {
    tiny: 70,
    small: 180,
    medium: 520,
    large: 1400,
  },
} as const;

export interface Personality {
  chase: number;
  flee: number;
  food: number;
  virusFear: number;
  virusBait: number;
  wander: number;
  split: number;
  predict: number;
  risk: number;
  /** How long a chase may stall before it is abandoned, in seconds. */
  persistence: number;
  /** Multiplier on AI.perception.reactionBase. */
  reaction: number;
  perception: number;
  stalk: number;
  /** Multiplier on the think interval. */
  think: number;
}

/** Nine archetypes. Same physics; different priorities. Not difficulty cheats. */
export const AI_PERSONALITY: Record<string, Personality> = {
  hunter:      { chase: 1.55, flee: 0.86, food: 0.72, virusFear: 1.0, virusBait: 0.18, wander: 0.28, split: 0.78, predict: 1.12, risk: 1.12, persistence: 5.4, reaction: 0.78, perception: 1.05, stalk: 0.35, think: 0.92 },
  opportunist: { chase: 1.18, flee: 1.0,  food: 0.95, virusFear: 1.0, virusBait: 0.42, wander: 0.48, split: 0.5,  predict: 0.86, risk: 1.0,  persistence: 3.3, reaction: 0.95, perception: 1.0,  stalk: 0.55, think: 1.0 },
  coward:      { chase: 0.42, flee: 1.72, food: 1.12, virusFear: 1.28, virusBait: 0.9, wander: 0.38, split: 0.06, predict: 0.42, risk: 0.55, persistence: 1.6, reaction: 0.62, perception: 1.1,  stalk: 0.15, think: 0.8 },
  collector:   { chase: 0.52, flee: 1.14, food: 1.72, virusFear: 1.12, virusBait: 0.16, wander: 0.52, split: 0.08, predict: 0.36, risk: 0.68, persistence: 2.1, reaction: 1.05, perception: 0.96, stalk: 0.2,  think: 1.05 },
  wanderer:    { chase: 0.7,  flee: 0.96, food: 0.78, virusFear: 0.9,  virusBait: 0.22, wander: 1.55, split: 0.14, predict: 0.4,  risk: 0.88, persistence: 2.5, reaction: 1.32, perception: 1.12, stalk: 0.25, think: 1.18 },
  ambusher:    { chase: 1.22, flee: 0.94, food: 1.02, virusFear: 0.78, virusBait: 0.58, wander: 0.36, split: 0.82, predict: 0.92, risk: 1.05, persistence: 4.1, reaction: 0.85, perception: 0.92, stalk: 1.05, think: 0.95 },
  survivor:    { chase: 0.58, flee: 1.48, food: 1.22, virusFear: 1.38, virusBait: 0.64, wander: 0.4,  split: 0.1,  predict: 0.55, risk: 0.62, persistence: 2.2, reaction: 0.58, perception: 1.12, stalk: 0.3,  think: 0.84 },
  giant:       { chase: 1.02, flee: 0.58, food: 0.84, virusFear: 1.7,  virusBait: 0.02, wander: 0.42, split: 0.05, predict: 0.6,  risk: 0.78, persistence: 3.1, reaction: 1.2,  perception: 0.88, stalk: 0.2,  think: 1.12 },
  splitter:    { chase: 1.32, flee: 0.84, food: 0.66, virusFear: 1.0,  virusBait: 0.14, wander: 0.32, split: 1.38, predict: 1.0,  risk: 1.18, persistence: 3.7, reaction: 0.72, perception: 1.0,  stalk: 0.4,  think: 0.9 },
};
