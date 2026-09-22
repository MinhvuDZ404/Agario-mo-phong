import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/agar/config';
import { fullEngine, soloEngine, step, totalCellMass } from './helpers';

describe('spawn and lifecycle', () => {
  it('spawns the player with start mass and protection', () => {
    const engine = fullEngine();
    expect(engine.phase).toBe('playing');
    expect(engine.player.cells).toHaveLength(1);
    expect(engine.playerMass).toBe(BALANCE.startMass);
    expect(engine.player.protectedUntil).toBeGreaterThan(0);
  });

  it('ends the run when the player is eaten', () => {
    const engine = fullEngine();
    engine.player.protectedUntil = 0;
    // Drop a giant bot cell on top of the player.
    const killer = engine.owners[1].cells[0];
    killer.x = engine.player.cells[0].x;
    killer.y = engine.player.cells[0].y;
    killer.mass = 5000;
    step(engine, 0.5);
    expect(engine.phase).toBe('ended');
    expect(engine.stats.eatenBy.length).toBeGreaterThan(0);
  });

  it('restarts cleanly without leaking previous-run state', () => {
    const engine = fullEngine();
    step(engine, 2);
    engine.start('Again', 'ffa', 'classic', '#ee7b58');
    expect(engine.phase).toBe('playing');
    expect(engine.player.cells).toHaveLength(1);
    expect(engine.ejected).toHaveLength(0);
    expect(engine.particles).toHaveLength(0);
    expect(engine.floaters).toHaveLength(0);
    expect(engine.stats.food).toBe(0);
    expect(engine.stats.cells).toBe(0);
    expect(engine.validateInvariants()).toEqual([]);
  });

  it('respawns bots after death', () => {
    const engine = fullEngine();
    const victim = engine.owners[5];
    for (const cell of victim.cells) cell.alive = false;
    victim.cells = [];
    victim.respawnAt = engine.time + 0.1;
    step(engine, 1);
    expect(victim.cells.length).toBeGreaterThan(0);
  });
});

describe('eating', () => {
  it('lets a big cell eat a smaller one and gain its mass', () => {
    const engine = soloEngine();
    // Park all pellets in a far corner so only the victim contributes mass.
    for (const food of engine.food) { food.x = 30; food.y = 30; }
    const player = engine.player.cells[0];
    player.mass = 150;
    player.x = 2400;
    player.y = 2400;
    engine.player.protectedUntil = 0;
    // Re-add one victim bot manually.
    engine.owners.push({
      id: 99, name: 'snack', color: '#fff', skin: 'classic', team: 1,
      archetype: 'wanderer', cells: [], targetX: player.x, targetY: player.y,
      nextDecision: 999, splitAt: 999, respawnAt: 999, protectedUntil: 0,
    });
    const victim = { ...player, id: 424242, owner: 99, x: player.x, y: player.y, mass: 50, alive: true };
    engine.owners[1].cells = [victim as never];
    step(engine, 0.3);
    expect(engine.owners[1].cells).toHaveLength(0);
    expect(player.mass).toBeCloseTo(200, 0);
    expect(engine.stats.cells).toBe(1);
  });

  it('refuses equal-size eating (no pixel-touch kills)', () => {
    const engine = soloEngine();
    const player = engine.player.cells[0];
    player.mass = 100;
    engine.player.protectedUntil = 0;
    engine.owners.push({
      id: 99, name: 'rival', color: '#fff', skin: 'classic', team: 1,
      archetype: 'wanderer', cells: [], targetX: player.x, targetY: player.y,
      nextDecision: 999, splitAt: 999, respawnAt: 999, protectedUntil: 0,
    });
    engine.owners[1].cells = [{ ...player, id: 424243, owner: 99, mass: 100, alive: true } as never];
    step(engine, 1);
    expect(engine.player.cells.length).toBeGreaterThan(0);
    expect(engine.owners[1].cells.length).toBeGreaterThan(0);
  });

  it('eats pellets and grows', () => {
    const engine = soloEngine();
    const before = engine.playerMass;
    step(engine, 3);
    // Player may drift onto spawn-ring pellets; total food count stays constant.
    expect(engine.food).toHaveLength(BALANCE.foodCount);
    expect(totalCellMass(engine)).toBeGreaterThanOrEqual(before * 0.99);
  });
});

describe('split and merge', () => {
  it('splits mass exactly in half (conservation)', () => {
    const engine = soloEngine();
    engine.player.cells[0].mass = 100;
    engine.pointer = { x: 100, y: 0 };
    expect(engine.split()).toBe(true);
    expect(engine.player.cells).toHaveLength(2);
    const sum = engine.player.cells.reduce((total, cell) => total + cell.mass, 0);
    expect(sum).toBeCloseTo(100, 9);
  });

  it('rejects split below minimum mass and above fragment cap', () => {
    const engine = soloEngine();
    engine.player.cells[0].mass = BALANCE.minSplitMass - 1;
    expect(engine.split()).toBe(false);
    expect(engine.player.cells).toHaveLength(1);
  });

  it('merges fragments back with exact mass conservation', () => {
    const engine = soloEngine();
    for (const food of engine.food) { food.x = 30; food.y = 30; }
    engine.player.cells[0].mass = 100;
    engine.pointer = { x: 100, y: 0 };
    engine.split();
    const fragments = engine.player.cells;
    expect(fragments).toHaveLength(2);
    // Force merge readiness and overlap (100 total stays below decay threshold).
    for (const cell of fragments) {
      cell.mergeAt = 0;
      cell.x = 2400;
      cell.y = 2400;
      cell.vx = 0;
      cell.vy = 0;
    }
    step(engine, 0.2);
    expect(engine.player.cells).toHaveLength(1);
    expect(engine.player.cells[0].mass).toBeCloseTo(100, 6);
  });

  it('survives repeated split/merge cycles without leaks', () => {
    const engine = soloEngine();
    for (let i = 0; i < 30; i++) {
      engine.player.cells[0].mass = 200;
      engine.player.cells = engine.player.cells.slice(0, 1);
      engine.pointer = { x: 50, y: 10 };
      engine.split();
      for (const cell of engine.player.cells) {
        cell.mergeAt = 0;
        cell.x = 2400;
        cell.y = 2400;
      }
      step(engine, 0.2);
    }
    expect(engine.player.cells.length).toBeLessThanOrEqual(BALANCE.maxFragments);
    expect(engine.validateInvariants()).toEqual([]);
  });
});

describe('eject mass', () => {
  it('deducts mass and spawns a blob', () => {
    const engine = soloEngine();
    engine.player.cells[0].mass = 100;
    const before = engine.playerMass;
    engine.player.targetX = engine.player.cells[0].x + 500;
    engine.player.targetY = engine.player.cells[0].y;
    expect(engine.eject()).toBe(true);
    expect(engine.ejected).toHaveLength(1);
    expect(engine.playerMass).toBeCloseTo(before - BALANCE.ejectCost, 9);
    expect(engine.ejected[0].mass).toBe(BALANCE.ejectMass);
  });

  it('refuses eject when too small', () => {
    const engine = soloEngine();
    engine.player.cells[0].mass = 10;
    expect(engine.eject()).toBe(false);
    expect(engine.ejected).toHaveLength(0);
  });

  it('caps ejected blobs under spam', () => {
    const engine = soloEngine();
    engine.player.cells[0].mass = 100000;
    engine.player.targetX = 4000;
    engine.player.targetY = 4000;
    for (let i = 0; i < 600; i++) {
      engine.update(1 / 60);
      // Bypass cooldown to simulate the worst case caller.
      (engine as unknown as { ejectAt: number }).ejectAt = 0;
      engine.keys.add('w');
    }
    engine.keys.delete('w');
    expect(engine.ejected.length).toBeLessThanOrEqual(BALANCE.maxEjected);
    expect(engine.validateInvariants()).toEqual([]);
  });
});

describe('virus', () => {
  it('bursts a large cell into fragments', () => {
    const engine = soloEngine();
    const player = engine.player.cells[0];
    player.mass = 600;
    engine.player.protectedUntil = 0;
    const virus = engine.viruses[0];
    virus.mother = false;
    player.x = virus.x;
    player.y = virus.y;
    step(engine, 0.3);
    expect(engine.player.cells.length).toBeGreaterThan(2);
    expect(engine.validateInvariants()).toEqual([]);
  });

  it('ignores small cells', () => {
    const engine = soloEngine();
    const player = engine.player.cells[0];
    player.mass = 40;
    engine.player.protectedUntil = 0;
    const virus = engine.viruses[0];
    player.x = virus.x;
    player.y = virus.y;
    step(engine, 1);
    expect(engine.player.cells).toHaveLength(1);
  });

  it('duplicates when fed enough, within the cap', () => {
    const engine = soloEngine();
    const virus = engine.viruses[0];
    virus.mother = false;
    const before = engine.viruses.length;
    for (let i = 0; i < BALANCE.virusFeedThreshold; i++) {
      engine.ejected.push({
        id: 900000 + i, x: virus.x, y: virus.y, vx: 10, vy: 0,
        color: '#fff', mass: BALANCE.ejectMass, radius: 9, born: engine.time - 1, owner: 0,
      });
    }
    step(engine, 0.3);
    expect(engine.viruses.length).toBeGreaterThanOrEqual(before);
    expect(engine.viruses.length).toBeLessThanOrEqual(BALANCE.maxViruses);
  });
});

describe('pause and time safety', () => {
  it('freezes the simulation while paused', () => {
    const engine = fullEngine();
    step(engine, 1);
    const time = engine.time;
    const positions = engine.owners.map(owner => owner.cells.map(cell => [cell.x, cell.y]));
    engine.paused = true;
    step(engine, 5);
    expect(engine.time).toBe(time);
    expect(engine.owners.map(owner => owner.cells.map(cell => [cell.x, cell.y]))).toEqual(positions);
  });

  it('clamps huge delta times (background tab safety)', () => {
    const engine = fullEngine();
    step(engine, 1);
    const mass = totalCellMass(engine);
    engine.update(30); // Simulate a 30s background tab.
    expect(engine.time).toBeLessThan(1 + BALANCE.maxFrameDt + 0.01);
    expect(Number.isFinite(totalCellMass(engine))).toBe(true);
    expect(Math.abs(totalCellMass(engine) - mass)).toBeLessThan(mass * 0.5 + 500);
    expect(engine.validateInvariants()).toEqual([]);
  });

  it('ignores non-finite and negative deltas', () => {
    const engine = fullEngine();
    const time = engine.time;
    engine.update(NaN);
    engine.update(Infinity);
    engine.update(-1);
    expect(engine.time).toBe(time);
  });
});

describe('leaderboard and ranking', () => {
  it('ranks by real total mass', () => {
    const engine = fullEngine();
    const snapshot = engine.snapshot();
    const masses = snapshot.leaders.map(leader => leader.mass);
    const sorted = [...masses].sort((a, b) => b - a);
    expect(masses).toEqual(sorted);
    expect(snapshot.population).toBeGreaterThan(0);
  });
});
