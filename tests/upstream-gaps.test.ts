import { describe, expect, it } from 'vitest';
import { recipeNav, recipes } from '../src/lib/recipes/index.ts';
import { navItemId } from '../src/lib/recipes/sections.ts';
import { UPSTREAM_GAPS } from './upstream-gaps.ts';

describe('upstream gap ledger', () => {
  it('names only recipes the catalog carries', () => {
    const ids = new Set(recipes.map((r) => r.id));
    for (const id of UPSTREAM_GAPS.titleCaseLabel)
      expect(ids.has(id)).toBe(true);
    for (const id of [
      ...UPSTREAM_GAPS.helpRefsHiddenField,
      ...UPSTREAM_GAPS.developerVocabulary,
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const entry of UPSTREAM_GAPS.undescribedModel) {
      expect(ids.has(entry.split(' ')[0])).toBe(true);
    }
  });

  it('expires: each gap still exists', () => {
    for (const id of UPSTREAM_GAPS.titleCaseLabel) {
      const recipe = recipes.find((r) => r.id === id);
      expect(
        recipe?.nav.some((e) => / [A-Z]/.test(e.label)),
        `${id} is fixed upstream; delete its entry`,
      ).toBe(true);
    }
    for (const gap of UPSTREAM_GAPS.sharedNavId) {
      const labels = new Set<string>();
      for (const recipe of recipes) {
        for (const e of recipeNav(recipe)) {
          if (navItemId(e.packageId, e.model.name, e.key) === gap) {
            labels.add(e.label);
          }
        }
      }
      expect(
        labels.size,
        `${gap} is fixed upstream; delete its entry`,
      ).toBeGreaterThan(1);
    }
  });
});
