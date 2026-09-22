/**
 * Central balance configuration — the single place where gameplay numbers live.
 *
 * Design rule: no other module may hard-code a gameplay constant. A designer
 * should be able to rebalance the game by editing this file only.
 */

/** Radius grows with the square root of mass so giants stay manageable. */
export const massRadius = (mass: number): number =>
  Math.sqrt(Math.max(0.0001, mass)) * BALANCE.radiusFactor;

/** Heavier cells move slower, but never feel broken. */
export const cellSpeed = (mass: number): number =>
  BALANCE.baseSpeed * Math.pow(Math.max(BALANCE.speedFloorMass, mass), BALANCE.speedExponent);

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
  baseSpeed: 385,
  speedExponent: -0.14,
  speedFloorMass: 20,

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
  splitImpulse: 760,
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
  decayRate: 0.0024,

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
  zoomExponent: 0.19,
  zoomMin: 0.26,
  zoomMax: 1.22,
  zoomOffsetMin: 0.65,
  zoomOffsetMax: 1.35,
  cameraSmoothing: 5,

  // -- AI -----------------------------------------------------------------------
  aiThinkMin: 0.22,
  aiThinkJitter: 0.18,
  aiPerception: 750,
  aiFleeMargin: 290,
  aiFoodSearch: 420,
  aiFleeRatio: 1.17,
  aiChaseRatio: 1.25,
  aiSplitRatio: 2.7,
  aiSplitRange: 170,
  aiFarDistance: 1500,

  // -- Presentation ---------------------------------------------------------------
  maxParticles: 160,
  maxFloaters: 40,
  pelletMinMass: 1.2,
  pelletBonusMass: 0.8,
} as const;

export type BalanceKey = keyof typeof BALANCE;
