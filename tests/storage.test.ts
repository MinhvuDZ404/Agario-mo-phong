import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_VERSION, earnedAchievements, loadSave, persistSave, sanitizeNickname,
} from '../src/agar/storage';

function mockStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  } as Storage);
  return store;
}

describe('save system', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('returns safe defaults when storage is empty', () => {
    mockStorage();
    const save = loadSave();
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.nickname).toBe('');
    expect(save.volume).toBeGreaterThanOrEqual(0);
  });

  it('survives corrupted JSON without throwing', () => {
    mockStorage({ 'agar-community-v3': '{{{not json' });
    expect(() => loadSave()).not.toThrow();
    expect(loadSave().version).toBe(SAVE_VERSION);
  });

  it('rejects out-of-range and mistyped values', () => {
    mockStorage({
      'agar-community-v3': JSON.stringify({
        nickname: 12345, skin: 'hacker', color: 'red', record: 'lots',
        volume: 99, preferences: { dark: 'yes', names: 1 },
        achievements: 'all', best: { bestMass: NaN },
      }),
    });
    const save = loadSave();
    expect(save.nickname).toBe('');
    expect(save.skin).toBe('classic');
    expect(save.volume).toBeLessThanOrEqual(1);
    expect(save.preferences.dark).toBe(false);
    expect(save.achievements).toEqual([]);
    expect(Number.isFinite(save.best.bestMass)).toBe(true);
  });

  it('migrates legacy v2 saves forward', () => {
    mockStorage({
      'agar-community-v2': JSON.stringify({ nickname: 'Old', record: 500 }),
    });
    const save = loadSave();
    expect(save.nickname).toBe('Old');
    expect(save.record).toBe(500);
    expect(save.best.bestMass).toBe(500);
  });

  it('round-trips a valid save', () => {
    mockStorage();
    const save = loadSave();
    save.nickname = 'Tester';
    save.volume = 0.3;
    persistSave(save);
    expect(loadSave().nickname).toBe('Tester');
    expect(loadSave().volume).toBe(0.3);
  });

  it('never throws when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    } as unknown as Storage);
    expect(() => loadSave()).not.toThrow();
    expect(() => persistSave(loadSave())).not.toThrow();
  });
});

describe('nickname sanitizer', () => {
  it('strips control characters and caps length', () => {
    expect(sanitizeNickname('hi\u0000\u001fthere')).toBe('hithere');
    expect(sanitizeNickname('x'.repeat(100))).toHaveLength(18);
    expect(sanitizeNickname('  spaced  ')).toBe('spaced');
    expect(sanitizeNickname(123)).toBe('');
    expect(sanitizeNickname(null)).toBe('');
  });
});

describe('achievements', () => {
  const base = { peak: 0, food: 0, cells: 0, splitEats: 0, seconds: 0, bestRank: 99 };

  it('grants each milestone exactly once', () => {
    const first = earnedAchievements({ ...base, cells: 1, peak: 600, bestRank: 1 }, []);
    expect(first).toContain('first-blood');
    expect(first).toContain('mass-100');
    expect(first).toContain('mass-500');
    expect(first).toContain('rank-1');
    expect(earnedAchievements({ ...base, cells: 1, peak: 600, bestRank: 1 }, first)).toEqual([]);
  });

  it('requires real thresholds', () => {
    expect(earnedAchievements({ ...base, peak: 99 }, [])).not.toContain('mass-100');
    expect(earnedAchievements({ ...base, seconds: 299 }, [])).not.toContain('survive-5');
    expect(earnedAchievements({ ...base, bestRank: 11 }, [])).not.toContain('top-10');
  });
});
