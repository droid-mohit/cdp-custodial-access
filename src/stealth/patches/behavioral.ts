export interface Point {
  x: number;
  y: number;
  delay: number;
}

export interface ScrollStep {
  distance: number;
  delay: number;
}

function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function generateBezierPath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  steps: number,
): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const spread = Math.max(distance * 0.3, 20);
  const cp1 = {
    x: start.x + dx * 0.25 + gaussianRandom(0, spread * 0.5),
    y: start.y + dy * 0.25 + gaussianRandom(0, spread),
  };
  const cp2 = {
    x: start.x + dx * 0.75 + gaussianRandom(0, spread * 0.5),
    y: start.y + dy * 0.75 + gaussianRandom(0, spread),
  };

  const points: Point[] = [];
  const baseDelay = clamp(distance * 0.5, 2, 15);

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const mt = 1 - t;
    const x = mt * mt * mt * start.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * end.x;
    const y = mt * mt * mt * start.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * end.y;
    const speedFactor = 1 + 2 * Math.abs(t - 0.5);
    const delay = clamp(gaussianRandom(baseDelay * speedFactor, baseDelay * 0.3), 1, 50);
    points.push({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, delay });
  }

  return points;
}

export function generateTypingDelays(text: string): number[] {
  const delays: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    let baseDelay: number;
    if (char === ' ') {
      baseDelay = gaussianRandom(130, 40);
    } else if (char === char.toUpperCase() && char !== char.toLowerCase()) {
      baseDelay = gaussianRandom(100, 30);
    } else {
      baseDelay = gaussianRandom(80, 25);
    }
    if (Math.random() < 0.1) {
      baseDelay += gaussianRandom(80, 30);
    }
    delays.push(clamp(Math.round(baseDelay), 30, 300));
  }
  return delays;
}

export function generateScrollSteps(totalDistance: number): ScrollStep[] {
  const steps: ScrollStep[] = [];
  let remaining = totalDistance;
  const numSteps = clamp(Math.ceil(Math.abs(totalDistance) / 50), 3, 30);
  const direction = totalDistance > 0 ? 1 : -1;

  for (let i = 0; i < numSteps; i++) {
    const progress = i / numSteps;
    const factor = 1 - Math.pow(progress, 0.7);
    let stepDistance = (Math.abs(totalDistance) / numSteps) * (1 + factor);
    stepDistance = Math.min(stepDistance, Math.abs(remaining));
    if (i === numSteps - 1) {
      stepDistance = Math.abs(remaining);
    }
    remaining -= stepDistance * direction;
    const delay = clamp(gaussianRandom(16, 5), 8, 40);
    steps.push({
      distance: Math.round(stepDistance * direction * 100) / 100,
      delay: Math.round(delay),
    });
    if (Math.abs(remaining) < 1) break;
  }

  return steps;
}
