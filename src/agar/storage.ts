import { CELL_COLORS, DEFAULT_PREFERENCES, type GameMode, type Preferences, type SkinId } from './types';

export const SAVE_VERSION = 3;
const STORAGE_KEY = 'agar-community-v3';
const LEGACY_KEY = 'agar-community-v2';

const SKIN_IDS: SkinId[] = ['classic', 'earth', 'melon', 'smile', 'planet', '8ball', 'sunset', 'checker'];
const MODES: GameMode[] = ['ffa', 'teams', 'experimental'];

export interface BestStats {
  bestMass: number;
  bestRank: number;
  mostCells: number;
  longestRun: number;
  totalEaten: number;
  gamesPlayed: number;
}

export interface SaveData {
  version: number;
  nickname: string;
  mode: GameMode;
  skin: SkinId;
  color: string;
  record: number;
  volume: number;
  preferences: Preferences;
  achievements: string[];
  best: BestStats;
}

/** Strip control characters, trim, and cap length so nicknames can never break UI. */
export function sanitizeNickname(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 18);
}

function sanitizePreferences(value: unknown): Preferences {
  const preferences = { ...DEFAULT_PREFERENCES };
  if (value && typeof value === 'object') {
    for (const key of Object.keys(preferences) as (keyof Preferences)[]) {
      const entry = (value as Record<string, unknown>)[key];
      if (typeof entry === 'boolean') preferences[key] = entry;
    }
  }
  return preferences;
}

function sanitizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function sanitizeBest(value: unknown): BestStats {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    bestMass: sanitizeNumber(source.bestMass, 0, 0, 10_000_000),
    bestRank: sanitizeNumber(source.bestRank, 0, 0, 1000),
    mostCells: sanitizeNumber(source.mostCells, 0, 0, 1_000_000),
    longestRun: sanitizeNumber(source.longestRun, 0, 0, 86400 * 30),
    totalEaten: sanitizeNumber(source.totalEaten, 0, 0, 100_000_000),
    gamesPlayed: sanitizeNumber(source.gamesPlayed, 0, 0, 1_000_000),
  };
}

function sanitizeAchievements(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string').slice(0, 64);
}

function normalize(raw: unknown): SaveData {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const skin = SKIN_IDS.includes(source.skin as SkinId) ? (source.skin as SkinId) : 'classic';
  const color = CELL_COLORS.includes(String(source.color)) ? String(source.color) : CELL_COLORS[0];
  const mode = MODES.includes(source.mode as GameMode) ? (source.mode as GameMode) : 'ffa';
  const record = sanitizeNumber(source.record, 0, 0, 10_000_000);
  const best = sanitizeBest(source.best);
  if (record > 0 && best.bestMass <= 0) best.bestMass = record;
  return {
    version: SAVE_VERSION,
    nickname: sanitizeNickname(source.nickname),
    mode,
    skin,
    color,
    record,
    volume: sanitizeNumber(source.volume, 0.7, 0, 1),
    preferences: sanitizePreferences(source.preferences),
    achievements: sanitizeAchievements(source.achievements),
    best,
  };
}

function readRaw(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadSave(): SaveData {
  const current = readRaw(STORAGE_KEY);
  if (current && typeof current === 'object') return normalize(current);
  // Migrate legacy saves forward instead of dropping player data.
  const legacy = readRaw(LEGACY_KEY);
  if (legacy && typeof legacy === 'object') {
    const migrated = normalize(legacy);
    persistSave(migrated);
    return migrated;
  }
  return normalize(null);
}

export function persistSave(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch {
    /* Private browsing or quota errors must never crash the game. */
  }
}

/** Achievements are milestone flags; every check reads real simulation stats. */
export interface Achievement {
  id: string;
  name: string;
  hint: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-blood', name: 'Bữa đầu tiên', hint: 'Nuốt tế bào đầu tiên' },
  { id: 'mass-100', name: 'Trăm cân', hint: 'Đạt 100 khối lượng' },
  { id: 'mass-500', name: 'Kẻ săn mồi', hint: 'Đạt 500 khối lượng' },
  { id: 'mass-1500', name: 'Quái vật arena', hint: 'Đạt 1.500 khối lượng' },
  { id: 'top-10', name: 'Góp mặt top 10', hint: 'Lọt vào top 10' },
  { id: 'rank-1', name: 'Bá chủ arena', hint: 'Vươn lên hạng 1' },
  { id: 'survive-5', name: 'Sống dai', hint: 'Sống sót 5 phút' },
  { id: 'split-hunter', name: 'Thợ săn phân tách', hint: 'Ăn 5 tế bào khi đang tách' },
  { id: 'pellet-500', name: 'Máy hút hạt', hint: 'Ăn 500 hạt trong một ván' },
];

/** Pure check: given live snapshot data, which achievement ids are newly earned? */
export function earnedAchievements(
  stats: { peak: number; food: number; cells: number; splitEats: number; seconds: number; bestRank: number },
  unlocked: readonly string[],
): string[] {
  const has = new Set(unlocked);
  const fresh: string[] = [];
  const grant = (id: string, condition: boolean) => {
    if (condition && !has.has(id)) {
      has.add(id);
      fresh.push(id);
    }
  };
  grant('first-blood', stats.cells >= 1);
  grant('mass-100', stats.peak >= 100);
  grant('mass-500', stats.peak >= 500);
  grant('mass-1500', stats.peak >= 1500);
  grant('top-10', stats.bestRank >= 1 && stats.bestRank <= 10);
  grant('rank-1', stats.bestRank === 1);
  grant('survive-5', stats.seconds >= 300);
  grant('split-hunter', stats.splitEats >= 5);
  grant('pellet-500', stats.food >= 500);
  return fresh;
}
