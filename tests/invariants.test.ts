import { describe, expect, it } from 'vitest';
import { BALANCE, massRadius } from '../src/agar/config';
import { AgarEngine } from '../src/agar/engine';
import { fullEngine, soloEngine, step } from './helpers';

/** Deterministic PRNG for property tests (mulberry32). */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('structural invariants', () => {
  it('holds with zero violations on a fresh arena', () => {
    expect(fullEngine().validateInvariants()).toEqual([]);
  });

  it('holds after 60 seconds of full simulation', () => {
    const engine = fullEngine();
    step(engine, 60, 1 / 30);
    expect(engine.validateInvariants()).toEqual([]);
  });

  it('holds across many random seeds', () => {
    for (const seed of [1, 42, 1337, 9001, 123456]) {
      const engine = fullEngine(seed);
      step(engine, 10);
      expect(engine.validateInvariants()).toEqual([]);
    }
  });

  it('keeps every radius consistent with its mass', () => {
    const engine = fullEngine(99);
    step(engine, 5);
    for (const owner of engine.owners) {
      for (const cell of owner.cells) {
        // Radius eases toward the formula; allow the interpolation slack.
        expect(Math.abs(cell.radius - massRadius(cell.mass))).toBeLessThan(massRadius(cell.mass) * 0.6 + 2);
      }
    }
  });
});

describe('property tests: random operations never corrupt the sim', () => {
  it('survives 500 random split/eject/move actions', () => {
    const engine = fullEngine(2024);
    const random = rng(2024);
    for (let i = 0; i < 500; i++) {
      const roll = random();
      engine.pointer = { x: (random() - 0.5) * 800, y: (random() - 0.5) * 800 };
      if (roll < 0.3) engine.split();
      else if (roll < 0.5) engine.eject();
      else if (roll < 0.55) engine.eject();
      if (engine.phase !== 'playing') break;
      engine.update(1 / 60);
      if (i % 50 === 0) expect(engine.validateInvariants()).toEqual([]);
    }
    expect(engine.validateInvariants()).toEqual([]);
  });

  it('handles extreme masses without NaN or Infinity', () => {
    const engine = soloEngine();
    for (const mass of [1, 40, 10000, 500000, 1e7]) {
      engine.player.cells[0].mass = mass;
      engine.player.cells[0].x = 2400;
      engine.player.cells[0].y = 2400;
      step(engine, 0.5);
      expect(engine.validateInvariants()).toEqual([]);
    }
  });

  it('handles random teleport positions by clamping into the arena', () => {
    const engine = soloEngine();
    const random = rng(77);
    for (let i = 0; i < 100; i++) {
      const cell = engine.player.cells[0];
      cell.x = (random() - 0.5) * BALANCE.worldSize * 3;
      cell.y = (random() - 0.5) * BALANCE.worldSize * 3;
      engine.update(1 / 60);
    }
    const cell = engine.player.cells[0];
    expect(cell.x).toBeGreaterThanOrEqual(0);
    expect(cell.x).toBeLessThanOrEqual(BALANCE.worldSize);
    expect(cell.y).toBeGreaterThanOrEqual(0);
    expect(cell.y).toBeLessThanOrEqual(BALANCE.worldSize);
  });
});

describe('determinism', () => {
  it('produces identical snapshots for identical seeds', () => {
    const a = new AgarEngine(555);
    const b = new AgarEngine(555);
    a.start('A', 'ffa', 'classic', '#ee7b58');
    b.start('A', 'ffa', 'classic', '#ee7b58');
    for (let i = 0; i < 300; i++) {
      a.update(1 / 60);
      b.update(1 / 60);
    }
    const snapA = a.snapshot();
    const snapB = b.snapshot();
    expect(snapA.leaders.map(leader => leader.mass)).toEqual(snapB.leaders.map(leader => leader.mass));
    expect(a.diagnostics().cells).toBe(b.diagnostics().cells);
  });
});

describe('long-run stability', () => {
  it('keeps entity counts bounded over 5 simulated minutes', () => {
    const engine = fullEngine(31337);
    step(engine, 300, 1 / 20);
    const diagnostics = engine.diagnostics();
    expect(diagnostics.food).toBe(BALANCE.foodCount);
    expect(diagnostics.ejected).toBeLessThanOrEqual(BALANCE.maxEjected);
    expect(diagnostics.viruses).toBeLessThanOrEqual(BALANCE.maxViruses);
    expect(diagnostics.particles).toBeLessThanOrEqual(BALANCE.maxParticles);
    expect(engine.validateInvariants()).toEqual([]);
  });

  it('survives 100 consecutive restarts without growth', () => {
    const engine = new AgarEngine(1);
    for (let i = 0; i < 100; i++) {
      engine.start(`run-${i}`, i % 2 === 0 ? 'ffa' : 'teams', 'classic', '#ee7b58');
      step(engine, 0.5);
    }
    expect(engine.validateInvariants()).toEqual([]);
    expect(engine.diagnostics().cells).toBeLessThanOrEqual((BALANCE.botCount + 1) * 3);
  });
});
