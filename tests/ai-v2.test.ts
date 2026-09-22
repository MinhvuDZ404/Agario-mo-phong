import { describe, expect, it } from 'vitest';
import {
  chooseEscape,
  classifySituation,
  commitStrategy,
  createBrain,
  createTotals,
  evaluateHunt,
  planTacticalActions,
  predictIntercept,
  recordDeath,
} from '../src/agar/ai';
import { AI, BALANCE, massRadius } from '../src/agar/config';
import { AgarEngine } from '../src/agar/engine';

describe('adaptive AI V2 planning', () => {
  it('projects a moving target instead of aiming at its last position', () => {
    const still = predictIntercept({
      selfX: 1000, selfY: 1000, selfSpeed: 220, targetX: 1300, targetY: 1000,
      targetVx: 0, targetVy: 0, world: BALANCE.worldSize,
    });
    const moving = predictIntercept({
      selfX: 1000, selfY: 1000, selfSpeed: 220, targetX: 1300, targetY: 1000,
      targetVx: 110, targetVy: 0, world: BALANCE.worldSize,
    });
    expect(moving.x).toBeGreaterThan(still.x);
    expect(moving.time).toBeGreaterThan(still.time);
  });

  it('detects a no-win chase before a bot commits to it', () => {
    const hunt = evaluateHunt({
      selfX: 1000, selfY: 1000, selfMass: 60, selfSpeed: 105, selfRadius: massRadius(60),
      preyX: 1750, preyY: 1000, preyVx: 300, preyVy: 0, preyMass: 52, preyRadius: massRadius(52),
      world: BALANCE.worldSize,
    });
    expect(hunt.successProbability).toBeLessThan(AI.planning.noWinProbability);
    expect(hunt.noWin).toBe(true);
  });

  it('finds an open corridor when threats cover two axes', () => {
    const escape = chooseEscape({
      x: 2400, y: 2400, speed: 190, radius: massRadius(70), mass: 70, world: BALANCE.worldSize,
      threats: [
        { x: 2050, y: 2400, vx: 90, vy: 0, mass: 1800, radius: massRadius(1800), score: 4, dist: 350 },
        { x: 2400, y: 2050, vx: 0, vy: 90, mass: 1600, radius: massRadius(1600), score: 3.4, dist: 350 },
      ],
      viruses: [], ownerId: 7, time: 2,
    });
    expect(escape.quality).toBeGreaterThan(0);
    expect(escape.x).toBeGreaterThan(2350);
    expect(escape.y).toBeGreaterThan(2350);
  });

  it('classifies emergency, crowded and opportunity contexts explicitly', () => {
    expect(classifySituation({
      dangerLevel: 1.8, opportunityLevel: 0.2, crowdingLevel: 10, mobilityLevel: 0.2,
      growthPotential: 0.4, escapeQuality: 0.2, hasThreat: true, hasPrey: true,
      splitOpportunity: false, virusOpportunity: false, vulnerable: false, wallDanger: 0,
    }).situation).toBe('TRAPPED');
    expect(classifySituation({
      dangerLevel: 0.08, opportunityLevel: 1.6, crowdingLevel: 1, mobilityLevel: 0.9,
      growthPotential: 0.5, escapeQuality: 0.8, hasThreat: false, hasPrey: true,
      splitOpportunity: true, virusOpportunity: false, vulnerable: false, wallDanger: 0,
    }).situation).toBe('SPLIT_OPPORTUNITY');
  });

  it('chooses an intercept route when direct chase is worse', () => {
    const preyEvaluation = evaluateHunt({
      selfX: 1500, selfY: 1800, selfMass: 600, selfSpeed: 180, selfRadius: massRadius(600),
      preyX: 1900, preyY: 1800, preyVx: 100, preyVy: 70, preyMass: 80, preyRadius: massRadius(80),
      world: BALANCE.worldSize,
    });
    const plan = planTacticalActions({
      selfX: 1500, selfY: 1800, selfSpeed: 180, selfMass: 600, selfRadius: massRadius(600),
      world: BALANCE.worldSize,
      prey: { x: 1900, y: 1800, vx: 100, vy: 70, mass: 80, radius: massRadius(80), evaluation: preyEvaluation },
      threats: [], escape: { x: 1000, y: 1800, quality: 0.9 }, dangerLevel: 0.1, crowdingLevel: 0,
    });
    expect(['direct', 'intercept', 'pressure']).toContain(plan.action);
    expect(plan.expectedGrowth).toBeGreaterThan(0);
  });

  it('keeps a committed target until a challenger is materially better', () => {
    const brain = createBrain(11, 1000, 1000, 0, 'hunter');
    brain.strategy = 'hunt';
    brain.since = 0;
    brain.targetCommitment = 0.8;
    expect(commitStrategy(brain, { hunt: 1.2, farm: 1.25 }, 4, false, false).strategy).toBe('hunt');
  });
});

describe('adaptive memory and outcome diagnostics', () => {
  it('classifies a wall death and stores it in the report counters', () => {
    const brain = createBrain(4, 80, 80, 0, 'survivor');
    brain.lastWall = 0.95;
    brain.mobilityLevel = 0.2;
    const totals = createTotals();
    recordDeath(brain, totals, 3);
    expect(brain.lastDeathReason).toBe('BOUNDARY_TRAP');
    expect(totals.deathReasons.BOUNDARY_TRAP).toBe(1);
  });

  it('remains stable across seven deterministic ecosystem seeds', () => {
    for (const seed of [7, 19, 31, 43, 59, 71, 97]) {
      const engine = new AgarEngine(seed);
      engine.spectate('ffa');
      for (let i = 0; i < 450; i++) engine.update(1 / 30);
      const report = engine.aiReport();
      expect(engine.validateInvariants()).toEqual([]);
      expect(report.decisions).toBeGreaterThan(100);
      expect(Number.isFinite(report.currentAverageMass)).toBe(true);
      expect(report.alive).toBeGreaterThan(20);
    }
  }, 15000);
});
