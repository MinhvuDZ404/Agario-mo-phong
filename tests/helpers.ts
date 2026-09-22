import { AgarEngine } from '../src/agar/engine';
import { BALANCE } from '../src/agar/config';

/** Start a deterministic arena with only the player alive (bots removed). */
export function soloEngine(seed = 7): AgarEngine {
  const engine = new AgarEngine(seed);
  engine.start('Tester', 'ffa', 'classic', '#ee7b58');
  engine.owners = engine.owners.slice(0, 1);
  return engine;
}

/** Start a full deterministic arena with bots. */
export function fullEngine(seed = 7): AgarEngine {
  const engine = new AgarEngine(seed);
  engine.start('Tester', 'ffa', 'classic', '#ee7b58');
  return engine;
}

export function step(engine: AgarEngine, seconds: number, dt = 1 / 60): void {
  const steps = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < steps; i++) engine.update(dt);
}

export function totalCellMass(engine: AgarEngine): number {
  return engine.owners.reduce(
    (sum, owner) => sum + owner.cells.reduce((inner, cell) => inner + cell.mass, 0),
    0,
  );
}

export { BALANCE };
