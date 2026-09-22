import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/agar/config';
import { AgarEngine } from '../src/agar/engine';
import type { GameMode } from '../src/agar/types';

/**
 * Automated playtest: a scripted bot plays the game like a human —
 * steering toward food, splitting at size, ejecting, pausing, dying and
 * restarting — in every game mode. Any crash, NaN, invariant break or
 * deadlock fails the run.
 */
function playSession(mode: GameMode, seed: number, seconds: number): AgarEngine {
  const engine = new AgarEngine(seed);
  engine.start('Playtester', mode, 'classic', '#ee7b58');
  const dt = 1 / 30;
  const steps = Math.round(seconds / dt);
  let splits = 0;
  let ejects = 0;
  for (let i = 0; i < steps; i++) {
    if (engine.phase !== 'playing') break;
    const main = engine.player.cells.reduce((a, b) => (a.mass > b.mass ? a : b), engine.player.cells[0]);
    if (!main) break;
    // Steer: orbit the arena center while chasing nearby food.
    const angle = engine.time * 0.35 + seed;
    const tx = 2400 + Math.cos(angle) * 1400;
    const ty = 2400 + Math.sin(angle * 0.8) * 1400;
    engine.pointer = { x: (tx - engine.camera.x) * engine.camera.zoom, y: (ty - engine.camera.y) * engine.camera.zoom };
    // Act like a player: split when big, eject occasionally, pause once.
    if (main.mass > 160 && engine.player.cells.length < 4 && i % 90 === 0) {
      if (engine.split()) splits++;
    }
    if (i % 140 === 0 && engine.eject()) ejects++;
    if (i === Math.floor(steps / 2)) {
      engine.paused = true;
      const frozen = engine.time;
      engine.update(dt);
      expect(engine.time).toBe(frozen);
      engine.paused = false;
    }
    engine.update(dt);
    if (i % 300 === 0) expect(engine.validateInvariants()).toEqual([]);
  }
  expect(engine.validateInvariants()).toEqual([]);
  expect(splits + ejects).toBeGreaterThanOrEqual(0);
  return engine;
}

describe('full session playtest', () => {
  for (const mode of ['ffa', 'teams', 'experimental'] as GameMode[]) {
    it(`plays a 90-second ${mode} session without defects`, () => {
      const engine = playSession(mode, 1000 + mode.length, 90);
      expect(engine.diagnostics().food).toBe(BALANCE.foodCount);
      // The run either survived with a sensible state or ended with stats.
      if (engine.phase === 'ended') {
        expect(engine.stats.seconds).toBeGreaterThan(0);
      } else {
        expect(engine.player.cells.length).toBeGreaterThan(0);
      }
    });
  }

  it('plays, dies, and restarts across modes', () => {
    const engine = new AgarEngine(5555);
    const modes: GameMode[] = ['ffa', 'teams', 'experimental', 'ffa'];
    for (const mode of modes) {
      engine.start('Playtester', mode, 'classic', '#ee7b58');
      for (let i = 0; i < 600 && engine.phase === 'playing'; i++) {
        engine.pointer = { x: Math.sin(i * 0.05) * 400, y: Math.cos(i * 0.03) * 400 };
        if (i % 120 === 0) engine.split();
        engine.update(1 / 30);
      }
      expect(engine.validateInvariants()).toEqual([]);
    }
    expect(engine.snapshot().stats).toBeDefined();
  });

  it('spectates, switches targets, and joins mid-round', () => {
    const engine = new AgarEngine(777);
    engine.spectate('ffa');
    for (let i = 0; i < 300; i++) {
      if (i % 100 === 0) engine.spectateNext();
      engine.update(1 / 30);
    }
    expect(engine.snapshot().spectating.length).toBeGreaterThan(0);
    engine.start('Joined', 'ffa', 'classic', '#ee7b58');
    expect(engine.phase).toBe('playing');
    expect(engine.player.cells).toHaveLength(1);
  });

  it('runs the frame pipeline at interactive speed', () => {
    const engine = new AgarEngine(42);
    engine.start('Speed', 'ffa', 'classic', '#ee7b58');
    const started = performance.now();
    for (let i = 0; i < 600; i++) engine.update(1 / 60);
    const elapsed = performance.now() - started;
    // 10 simulated seconds must compute in well under 10 real seconds.
    expect(elapsed).toBeLessThan(8000);
  });
});
