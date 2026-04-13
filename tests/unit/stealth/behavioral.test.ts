import { describe, it, expect } from 'vitest';
import { generateBezierPath, generateTypingDelays, generateScrollSteps } from '../../../src/stealth/patches/behavioral.js';

describe('generateBezierPath', () => {
  it('returns a path from start to end with multiple points', () => {
    const path = generateBezierPath({ x: 0, y: 0 }, { x: 100, y: 100 }, 20);
    expect(path.length).toBe(20);
    expect(path[0].x).toBeCloseTo(0, 0);
    expect(path[0].y).toBeCloseTo(0, 0);
    expect(path[path.length - 1].x).toBeCloseTo(100, 0);
    expect(path[path.length - 1].y).toBeCloseTo(100, 0);
  });

  it('generates non-linear paths (not a straight line)', () => {
    const path = generateBezierPath({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    const hasYVariation = path.some((p, i) => i > 0 && i < path.length - 1 && Math.abs(p.y) > 1);
    expect(hasYVariation).toBe(true);
  });

  it('includes per-step delays with Gaussian variation', () => {
    const path = generateBezierPath({ x: 0, y: 0 }, { x: 100, y: 100 }, 10);
    for (const point of path) {
      expect(point.delay).toBeTypeOf('number');
      expect(point.delay).toBeGreaterThan(0);
    }
  });
});

describe('generateTypingDelays', () => {
  it('returns one delay per character', () => {
    const delays = generateTypingDelays('hello');
    expect(delays.length).toBe(5);
  });

  it('delays are within realistic range', () => {
    const delays = generateTypingDelays('test input');
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(30);
      expect(delay).toBeLessThanOrEqual(300);
    }
  });

  it('adds longer pauses after spaces', () => {
    let spaceDelaySum = 0;
    let charDelaySum = 0;
    for (let i = 0; i < 100; i++) {
      const d = generateTypingDelays('a b');
      spaceDelaySum += d[1];
      charDelaySum += d[0];
    }
    expect(spaceDelaySum / 100).toBeGreaterThan(charDelaySum / 100);
  });
});

describe('generateScrollSteps', () => {
  it('returns steps that sum to approximately the target distance', () => {
    const steps = generateScrollSteps(500);
    const total = steps.reduce((sum, s) => sum + s.distance, 0);
    expect(total).toBeGreaterThanOrEqual(490);
    expect(total).toBeLessThanOrEqual(510);
  });

  it('has decreasing step sizes (momentum deceleration)', () => {
    const steps = generateScrollSteps(1000);
    expect(Math.abs(steps[steps.length - 1].distance)).toBeLessThanOrEqual(Math.abs(steps[0].distance));
  });

  it('includes per-step delays', () => {
    const steps = generateScrollSteps(300);
    for (const step of steps) {
      expect(step.delay).toBeTypeOf('number');
      expect(step.delay).toBeGreaterThan(0);
    }
  });
});
