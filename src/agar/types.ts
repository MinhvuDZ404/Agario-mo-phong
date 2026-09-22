import { BALANCE } from './config';

export type GameMode = 'ffa' | 'teams' | 'experimental';
export type GamePhase = 'lobby' | 'playing' | 'spectating' | 'ended';
export type SkinId = 'classic' | 'earth' | 'melon' | 'smile' | 'planet' | '8ball' | 'sunset' | 'checker';

/** AI personality archetype — data-driven behavior weights live in the engine. */
export type AiArchetype =
  | 'hunter'
  | 'opportunist'
  | 'coward'
  | 'collector'
  | 'wanderer'
  | 'ambusher'
  | 'survivor'
  | 'giant'
  | 'splitter';

export interface Preferences {
  dark: boolean;
  names: boolean;
  mass: boolean;
  grid: boolean;
  sound: boolean;
  minimap: boolean;
  quality: boolean;
}

export interface Cell {
  id: number;
  owner: number;
  x: number;
  y: number;
  /** Previous position, used to estimate velocity for AI interception. */
  lx: number;
  ly: number;
  mass: number;
  radius: number;
  vx: number;
  vy: number;
  born: number;
  mergeAt: number;
  alive: boolean;
  /** Visual-only eat pulse, 1 on eat and decaying to 0. Never affects physics. */
  pulse: number;
}

export interface Organism {
  id: number;
  name: string;
  color: string;
  skin: SkinId;
  team: number;
  archetype: AiArchetype;
  cells: Cell[];
  targetX: number;
  targetY: number;
  nextDecision: number;
  splitAt: number;
  respawnAt: number;
  protectedUntil: number;
}

export interface Food {
  id: number;
  x: number;
  y: number;
  color: string;
  mass: number;
  radius: number;
}

export interface EjectedMass extends Food {
  vx: number;
  vy: number;
  born: number;
  owner: number;
}

export interface Virus {
  id: number;
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  fed: number;
  mother: boolean;
  lastEmission: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life: number;
}

/** Floating combat text ("+12"). Visual only. */
export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  ttl: number;
}

export interface Leader {
  id: number;
  name: string;
  color: string;
  mass: number;
  player: boolean;
}

export interface RunStats {
  peak: number;
  food: number;
  cells: number;
  splitEats: number;
  seconds: number;
  bestRank: number;
  eatenBy: string;
}

export interface ArenaSnapshot {
  phase: GamePhase;
  paused: boolean;
  score: number;
  cells: number;
  rank: number;
  population: number;
  leaders: Leader[];
  stats: RunStats;
  teamShares: number[];
  spectating: string;
  mergeIn: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  dark: false,
  names: true,
  mass: false,
  grid: true,
  sound: false,
  minimap: true,
  quality: true,
};

export const CELL_COLORS = ['#ee7b58', '#8b73d6', '#ed799a', '#64b5e6', '#8fc960', '#edb34b', '#55bcb0', '#a080d7'];
export const TEAM_COLORS = ['#ea7976', '#6da5df', '#81bf73'];
export const FOOD_COLORS = ['#ec9bb5', '#b4a1df', '#8dc7e9', '#a9cf8c', '#eac881', '#8dcebd', '#e5a08b'];
/** @deprecated Import from `./config` BALANCE instead. Kept for backwards compatibility. */
export const WORLD_SIZE = BALANCE.worldSize;
/** @deprecated Import from `./config` BALANCE instead. Kept for backwards compatibility. */
export const BOT_COUNT = BALANCE.botCount;
export { massRadius } from './config';
