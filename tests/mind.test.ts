import { describe, expect, it } from 'vitest';
import {
  assessThreat, chooseEscape, commitStrategy, createBrain, createTotals, recordDeath,
  scorePrey, splitDecision, think,
} from '../src/agar/ai';
import { AI, BALANCE, massRadius } from '../src/agar/config';
import type { Cell, Organism } from '../src/agar/types';

function cell(partial: Partial<Cell> & Pick<Cell, 'id' | 'owner' | 'x' | 'y' | 'mass'>): Cell {
  return {
    lx: partial.x, ly: partial.y, radius: massRadius(partial.mass),
    vx: 0, vy: 0, born: 0, mergeAt: 0, alive: true, pulse: 0,
    ...partial,
  };
}

function owner(partial: Partial<Organism> & Pick<Organism, 'id' | 'archetype' | 'cells'>): Organism {
  return {
    name: 'bot', color: '#fff', skin: 'classic', team: 0,
    targetX: 0, targetY: 0, nextDecision: 0, splitAt: 0, respawnAt: 0, protectedUntil: 0,
    ...partial,
  };
}

describe('threat perception', () => {
  it('ignores cells outside perception range', () => {
    const far = assessThreat({
      selfX: 1000, selfY: 1000, selfVx: 0, selfVy: 0, selfMass: 80, selfRadius: massRadius(80),
      otherX: 1000 + AI.perception.max + 40, otherY: 1000, otherVx: 0, otherVy: 0,
      otherMass: 4000, otherRadius: massRadius(4000),
      perception: AI.perception.base, fleeMul: 1,
    });
    expect(far).toBeNull();
  });

  it('rates a closing giant as more urgent than a distant one', () => {
    const close = assessThreat({
      selfX: 1000, selfY: 1000, selfVx: 0, selfVy: 0, selfMass: 80, selfRadius: massRadius(80),
      otherX: 1180, otherY: 1000, otherVx: -80, otherVy: 0, otherMass: 900, otherRadius: massRadius(900),
      perception: 1020, fleeMul: 1,
    });
    const far = assessThreat({
      selfX: 1000, selfY: 1000, selfVx: 0, selfVy: 0, selfMass: 80, selfRadius: massRadius(80),
      otherX: 1800, otherY: 1000, otherVx: 0, otherVy: 0, otherMass: 900, otherRadius: massRadius(900),
      perception: 1020, fleeMul: 1,
    });
    expect(close).not.toBeNull();
    expect(far).not.toBeNull();
    expect(close!.score).toBeGreaterThan(far!.score);
    expect(close!.canEat).toBe(true);
  });
});

describe('escape planning', () => {
  it('runs away from the threat and off the wall', () => {
    const escape = chooseEscape({
      x: 80, y: 2400, speed: 180, radius: 30, mass: 70, world: BALANCE.worldSize,
      threats: [{ x: 20, y: 2400, vx: 40, vy: 0, mass: 2000, radius: 200, score: 4, dist: 60 }],
      viruses: [],
      ownerId: 3, time: 4,
    });
    expect(escape.x).toBeGreaterThan(200);
    expect(escape.x).toBeLessThan(BALANCE.worldSize - 40);
  });
});

describe('split judgment', () => {
  it('refuses a split that would be eaten', () => {
    const verdict = splitDecision({
      selfX: 1000, selfY: 1000, selfMass: 200, selfRadius: massRadius(200), fragments: 1,
      preyX: 1120, preyY: 1000, preyMass: 40, preyRadius: massRadius(40),
      threats: [{ x: 1080, y: 1000, mass: 800, radius: massRadius(800), dist: 90 }],
      viruses: [],
      splitUrge: 1.2, splitBias: 1, splitLesson: 0, world: BALANCE.worldSize, cooldownReady: true,
    });
    expect(verdict.yes).toBe(false);
  });

  it('splits when the prey is in reach and the lane is clear', () => {
    const verdict = splitDecision({
      selfX: 2000, selfY: 2000, selfMass: 180, selfRadius: massRadius(180), fragments: 1,
      preyX: 2140, preyY: 2000, preyMass: 40, preyRadius: massRadius(40),
      threats: [], viruses: [],
      splitUrge: 1.2, splitBias: 1, splitLesson: 0, world: BALANCE.worldSize, cooldownReady: true,
    });
    expect(verdict.yes).toBe(true);
    expect(verdict.risky).toBe(false);
  });
});

describe('target scoring', () => {
  it('does not chase prey it cannot catch or split onto', () => {
    const scored = scorePrey({
      selfX: 1000, selfY: 1000, selfMass: 50, selfRadius: massRadius(50), selfSpeed: 200,
      preyX: 1400, preyY: 1000, preyVx: 220, preyVy: 0, preyMass: 48, preyRadius: massRadius(48),
      perception: 1020, world: BALANCE.worldSize, threatDanger: 0, predict: 0.5, splitUrge: 0,
    });
    expect(scored).toBeNull();
  });
});

describe('strategy hysteresis', () => {
  it('does not flip every tick when scores are close', () => {
    const brain = createBrain(1, 1000, 1000, 0, 'opportunist');
    brain.strategy = 'farm';
    brain.since = 5;
    const first = commitStrategy(brain, { farm: 1.2, hunt: 1.35, explore: 0.4 }, 5.2, false, false);
    const second = commitStrategy(brain, { farm: 1.2, hunt: 1.5, explore: 0.4 }, 5.35, false, false);
    expect(first.strategy).toBe('farm');
    expect(second.strategy).toBe('farm');
  });

  it('still flees immediately when the threat is on top of it', () => {
    const brain = createBrain(1, 1000, 1000, 0, 'collector');
    brain.strategy = 'farm';
    brain.since = 10;
    const panic = commitStrategy(brain, { farm: 4, flee: 0.2 }, 10.1, true, true);
    expect(panic.strategy).toBe('flee');
  });
});

describe('think()', () => {
  function decide(archetype: Organism['archetype'], selfMass: number, other: Cell | null, extras: Partial<Parameters<typeof think>[0]> = {}) {
    const self = cell({ id: 1, owner: 2, x: 2000, y: 2000, mass: selfMass });
    const me = owner({ id: 2, archetype, cells: [self] });
    const brain = createBrain(2, self.x, self.y, 0, archetype);
    brain.spawnCautionUntil = 0;
    brain.reaction = 0;
    const cells = other ? [self, other] : [self];
    const owners = new Map<number, Organism>([[2, me]]);
    if (other) owners.set(other.owner, owner({ id: other.owner, archetype: 'wanderer', cells: [other], protectedUntil: 0 }));
    return think({
      time: 8,
      world: BALANCE.worldSize,
      mode: 'ffa',
      owner: me,
      cells,
      viruses: [],
      ejected: [],
      foodNear: () => [],
      ownerOf: id => owners.get(id),
      random: () => 0.2,
      brain,
      focusDist: 0,
      ...extras,
    });
  }

  it('flees a giant inside perception and ignores one that was never perceived', () => {
    const giant = cell({ id: 9, owner: 3, x: 2180, y: 2000, mass: 1600 });
    const fleeing = decide('survivor', 80, giant);
    expect(fleeing.strategy === 'flee' || fleeing.strategy === 'bait' || fleeing.urgent).toBe(true);
    expect(fleeing.x).toBeLessThan(2000);

    const unseen = decide('survivor', 80, null);
    expect(unseen.threat).toBe(0);
    expect(unseen.strategy).not.toBe('flee');
  });

  it('hunts a clearly edible cell instead of wandering', () => {
    const snack = cell({ id: 9, owner: 3, x: 2300, y: 2000, mass: 40 });
    const hunting = decide('hunter', 400, snack);
    expect(hunting.strategy === 'hunt' || hunting.strategy === 'stalk').toBe(true);
    expect(hunting.x).toBeGreaterThan(2000);
  });

  it('farms a nearby pellet cluster when nothing else is worth it', () => {
    const self = cell({ id: 1, owner: 2, x: 2000, y: 2000, mass: 50 });
    const me = owner({ id: 2, archetype: 'collector', cells: [self] });
    const brain = createBrain(2, self.x, self.y, 0, 'collector');
    brain.spawnCautionUntil = 0;
    const foods = Array.from({ length: 8 }, (_, i) => ({
      id: 100 + i, x: 2200 + (i % 3) * 12, y: 2000 + Math.floor(i / 3) * 12,
      color: '#fff', mass: 1.4, radius: 4,
    }));
    const decision = think({
      time: 6, world: BALANCE.worldSize, mode: 'ffa', owner: me, cells: [self],
      viruses: [], ejected: [], foodNear: () => foods, ownerOf: () => me,
      random: () => 0.1, brain, focusDist: 0,
    });
    expect(decision.strategy).toBe('farm');
    expect(decision.x).toBeGreaterThan(2050);
  });

  it('turns back toward open space when pinned to the border', () => {
    const self = cell({ id: 1, owner: 2, x: 70, y: 70, mass: 90 });
    const me = owner({ id: 2, archetype: 'wanderer', cells: [self] });
    const brain = createBrain(2, self.x, self.y, 0, 'wanderer');
    brain.spawnCautionUntil = 0;
    const decision = think({
      time: 6, world: BALANCE.worldSize, mode: 'ffa', owner: me, cells: [self],
      viruses: [], ejected: [], foodNear: () => [], ownerOf: () => me,
      random: () => 0.4, brain, focusDist: 0,
    });
    expect(decision.x).toBeGreaterThan(self.x);
    expect(decision.y).toBeGreaterThan(self.y);
    expect(decision.wall).toBeGreaterThan(0.5);
  });
});

describe('death accounting', () => {
  it('marks a death avoidable when a known threat was ignored', () => {
    const brain = createBrain(4, 100, 100, 0, 'hunter');
    brain.strategy = 'hunt';
    brain.lastThreat = 2;
    brain.threatLatchedAt = 1;
    brain.reaction = 0.1;
    const totals = createTotals();
    recordDeath(brain, totals, 3);
    expect(totals.deaths).toBe(1);
    expect(totals.avoidableDeaths).toBe(1);
  });
});
