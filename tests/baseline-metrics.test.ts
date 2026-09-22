import { describe, expect, it } from 'vitest';
import { AgarEngine } from '../src/agar/engine';
import { BALANCE } from '../src/agar/config';

/**
 * Same 60s FFA seed as the pre-overhaul probe, so survival and growth can be
 * compared instead of trusted from a green unit test.
 *
 * Old AI, seed 20240922, 1/30 step:
 * deaths 12, endAvg 446, endMedian 320, endMax 1950, alive 45.
 */
describe('ecosystem quality', () => {
  it('keeps a 60s FFA alive, growing, and not oscillating itself to death', () => {
    const engine = new AgarEngine(20240922);
    engine.start('Probe', 'ffa', 'classic', '#ee7b58');
    const startMass = engine.owners.slice(1).map(owner => owner.cells.reduce((sum, cell) => sum + cell.mass, 0));
    const dt = 1 / 30;
    const steps = Math.round(60 / dt);
    let deaths = 0;
    const aliveAt = new Map(engine.owners.slice(1).map(owner => [owner.id, true]));
    for (let i = 0; i < steps; i++) {
      engine.update(dt);
      for (const owner of engine.owners.slice(1)) {
        const alive = owner.cells.length > 0;
        if (aliveAt.get(owner.id) && !alive) deaths++;
        aliveAt.set(owner.id, alive);
      }
    }
    const endMass = engine.owners.slice(1).filter(owner => owner.cells.length).map(owner => owner.cells.reduce((sum, cell) => sum + cell.mass, 0));
    const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const sorted = [...endMass].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const report = engine.aiReport();
    const snapshot = {
      deaths,
      reportedDeaths: report.deaths,
      avoidable: report.avoidableDeaths,
      startAvg: Math.round(avg(startMass)),
      endAvg: Math.round(avg(endMass)),
      endMedian: Math.round(median),
      endMax: Math.round(Math.max(...endMass, 0)),
      alive: endMass.length,
      food: report.foodEaten,
      prey: report.preyEaten,
      hunts: report.hunts,
      huntsWon: report.huntsWon,
      splits: report.splits,
      oscillations: report.oscillations,
      switches: report.switches,
      share: Object.fromEntries(Object.entries(report.stateShare).map(([key, value]) => [key, Math.round(value * 100)])),
      leaders: engine.snapshot().leaders.slice(0, 5).map(leader => ({ name: leader.name, mass: leader.mass, player: leader.player })),
    };
    console.log(JSON.stringify(snapshot));
    expect(engine.validateInvariants()).toEqual([]);
    expect(engine.food).toHaveLength(BALANCE.foodCount);
    expect(endMass.length).toBeGreaterThanOrEqual(30);
    expect(report.foodEaten).toBeGreaterThan(200);
    expect(report.oscillations).toBeLessThan(Math.max(40, report.switches));
    expect(Object.values(report.stateShare).some(share => share > 0.05)).toBe(true);
    expect(snapshot.endMax).toBeGreaterThan(snapshot.startAvg);
  });
});
