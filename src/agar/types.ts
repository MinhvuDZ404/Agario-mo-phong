export type GameMode = 'ffa' | 'teams' | 'experimental';
export type GamePhase = 'lobby' | 'playing' | 'spectating' | 'ended';
export type SkinId = 'classic' | 'earth' | 'melon' | 'smile' | 'planet' | '8ball' | 'sunset' | 'checker';

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
  mass: number;
  radius: number;
  vx: number;
  vy: number;
  born: number;
  mergeAt: number;
  alive: boolean;
}

export interface Organism {
  id: number;
  name: string;
  color: string;
  skin: SkinId;
  team: number;
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
export const WORLD_SIZE = 4800;
export const BOT_COUNT = 48;
export const massRadius = (mass: number) => Math.sqrt(mass) * 5;