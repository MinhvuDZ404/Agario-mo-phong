import { describe, expect, it } from 'vitest';
import { BALANCE, cellSpeed, massRadius, mergeDelay, zoomForMass } from '../src/agar/config';

describe('mass → radius formula', () => {
  it('grows monotonically and sub-linearly', () => {
    let previous = 0;
    for (const mass of [1, 10, 40, 100, 500, 2000, 10000, 100000]) {
      const radius = massRadius(mass);
      expect(Number.isFinite(radius)).toBe(true);
      expect(radius).toBeGreaterThan(previous);
      previous = radius;
    }
    // Doubling mass must grow radius by ~sqrt(2), never double it.
    expect(massRadius(200) / massRadius(100)).toBeCloseTo(Math.SQRT2, 5);
  });

  it('never returns NaN or Infinity for extreme inputs', () => {
    for (const mass of [0, -5, 1e-9, 1e9, Number.MAX_SAFE_INTEGER]) {
      const radius = massRadius(mass);
      expect(Number.isFinite(radius)).toBe(true);
      expect(radius).toBeGreaterThan(0);
    }
  });

  it('keeps realistic giants inside the arena scale', () => {
    // A 100k-mass monster (far beyond reachable play) still fits the arena.
    expect(massRadius(100_000)).toBeLessThan(BALANCE.worldSize);
    // Sub-linear growth: 100x mass is only 10x radius.
    expect(massRadius(10_000) / massRadius(100)).toBeCloseTo(10, 5);
  });
});

describe('mass → speed formula', () => {
  it('makes small cells faster and large cells slower', () => {
    expect(cellSpeed(25)).toBeGreaterThan(cellSpeed(40));
    expect(cellSpeed(40)).toBeGreaterThan(cellSpeed(500));
    expect(cellSpeed(500)).toBeGreaterThan(cellSpeed(5000));
  });

  it('never stalls or explodes', () => {
    for (const mass of [1, 40, 1000, 100000, 1e9]) {
      const speed = cellSpeed(mass);
      expect(Number.isFinite(speed)).toBe(true);
      expect(speed).toBeGreaterThan(0);
    }
  });
});

describe('camera zoom formula', () => {
  it('zooms out as mass grows', () => {
    expect(zoomForMass(40)).toBeGreaterThan(zoomForMass(400));
    expect(zoomForMass(400)).toBeGreaterThan(zoomForMass(4000));
  });

  it('stays within the configured zoom band', () => {
    for (const mass of [1, 40, 10000, 1e9]) {
      expect(zoomForMass(mass)).toBeLessThanOrEqual(BALANCE.zoomMax + 0.01);
      expect(zoomForMass(mass)).toBeGreaterThan(0);
    }
  });
});

describe('merge delay formula', () => {
  it('scales with fragment mass so giants wait longer', () => {
    expect(mergeDelay(100)).toBeGreaterThan(mergeDelay(20));
    expect(mergeDelay(1000)).toBeGreaterThan(mergeDelay(100));
    expect(Number.isFinite(mergeDelay(1e6))).toBe(true);
  });
});

describe('balance constants sanity', () => {
  it('keeps the eat chain strict: small can never eat big', () => {
    expect(BALANCE.eatRatio).toBeGreaterThan(1);
    expect(BALANCE.ejectEatRatio).toBeGreaterThan(1);
  });

  it('keeps split/eject costs positive and affordable', () => {
    expect(BALANCE.minSplitMass).toBeGreaterThan(0);
    expect(BALANCE.ejectCost).toBeGreaterThanOrEqual(BALANCE.ejectMass);
    expect(BALANCE.maxFragments).toBeGreaterThanOrEqual(2);
  });

  it('keeps virus thresholds above spawn size', () => {
    expect(BALANCE.virusTriggerMass).toBeGreaterThan(BALANCE.startMass);
    expect(BALANCE.motherTriggerMass).toBeGreaterThan(BALANCE.virusTriggerMass);
  });
});
