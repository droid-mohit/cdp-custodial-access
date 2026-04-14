// tests/unit/auth/recipes.test.ts
import { describe, it, expect } from 'vitest';
import { getRecipe, RECIPES } from '../../../src/auth/recipes.js';
import type { LoginRecipe } from '../../../src/auth/recipes.js';

describe('RECIPES', () => {
  it('contains a LinkedIn recipe', () => {
    const linkedin = RECIPES.find((r) => r.domain === 'www.linkedin.com');
    expect(linkedin).toBeDefined();
    expect(linkedin!.steps).toHaveLength(1);
    expect(linkedin!.steps[0].fields).toHaveLength(2);
  });

  it('contains a Google recipe with multi-step login', () => {
    const google = RECIPES.find((r) => r.domain === 'accounts.google.com');
    expect(google).toBeDefined();
    expect(google!.steps.length).toBeGreaterThan(1);
  });

  it('each recipe has at least one step with at least one field', () => {
    for (const recipe of RECIPES) {
      expect(recipe.steps.length).toBeGreaterThan(0);
      for (const step of recipe.steps) {
        expect(step.fields.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('getRecipe', () => {
  it('returns recipe for known domain', () => {
    const recipe = getRecipe('https://www.linkedin.com/login');
    expect(recipe).toBeDefined();
    expect(recipe!.domain).toBe('www.linkedin.com');
  });

  it('returns recipe for URL with path after domain', () => {
    const recipe = getRecipe('https://accounts.google.com/signin/v2/identifier');
    expect(recipe).toBeDefined();
    expect(recipe!.domain).toBe('accounts.google.com');
  });

  it('returns null for unknown domain', () => {
    const recipe = getRecipe('https://unknown-site.com/login');
    expect(recipe).toBeNull();
  });

  it('returns null for invalid URL', () => {
    const recipe = getRecipe('not-a-url');
    expect(recipe).toBeNull();
  });
});
