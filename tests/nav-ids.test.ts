import { describe, expect, it } from 'vitest';
import { migrateNavItemIds } from '../src/lib/blueprint/migrate.ts';
import { parseBlueprint } from '../src/lib/blueprint/validate.ts';
import { catalog } from '../src/lib/catalog/index.ts';
import { cookbooks } from '../src/lib/cookbooks/index.ts';
import { blueprintNavGroups } from '../src/lib/cookbooks/menu.ts';
import {
  featureEntries,
  featureNavItems,
} from '../src/lib/recipes/features.ts';
import {
  navItemId,
  navSectionOf,
  recipeNav,
  recipes,
} from '../src/lib/recipes/index.ts';

describe('navigation item ids', () => {
  it('are item:<pkg>:<Model>, with an explicit key for a repeat', () => {
    expect(navItemId('commerce', 'Order')).toBe('item:commerce:Order');
    expect(navItemId('commerce', 'Order', 'rush')).toBe(
      'item:commerce:Order:rush',
    );
  });

  it('never collide across recipes: a shared id means the same entry', () => {
    const seen = new Map<string, string>();
    for (const recipe of recipes) {
      for (const e of recipeNav(recipe)) {
        const id = navItemId(e.packageId, e.model.name, e.key);
        const shape = `${navSectionOf(recipe).id}|${e.label}`;
        expect(seen.get(id) ?? shape, `${id} in ${recipe.id}`).toBe(shape);
        seen.set(id, shape);
      }
    }
  });

  it('do not collide between recipes and features', () => {
    const recipeIds = new Set(
      recipes.flatMap((r) =>
        recipeNav(r).map((e) => navItemId(e.packageId, e.model.name, e.key)),
      ),
    );
    const features = featureEntries(catalog, recipes).map((f) => f.id);
    const ids = featureNavItems(features).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(recipeIds.has(id), id).toBe(false);
  });

  it.each(
    cookbooks.map((c) => [c.id, c] as const),
  )('%s menu has no duplicate ids', (_id, cookbook) => {
    const ids = blueprintNavGroups(cookbook.blueprint).flatMap((g) =>
      g.items.map((i) => i.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('migrateNavItemIds', () => {
  const old = {
    version: 1 as const,
    sectionOrder: ['section:sales', 'section:more'],
    itemOrder: {
      'section:sales': [
        'section:sales:commerce:Customer:Customers',
        'section:sales:commerce:Order:Sales Orders',
      ],
      'section:more': ['section:more:commerce:ProductionOrder'],
    },
    hidden: ['section:billing:commerce:Invoice:Invoices', 'section:more'],
    moved: {
      'section:sales:commerce:Order:Sales Orders': 'custom:shop',
      'section:more:commerce:ProductionOrder': 'section:sales',
    },
    items: {
      'section:sales:commerce:Order:Sales Orders': { label: 'Work orders' },
    },
    customSections: [{ id: 'custom:shop', label: 'Shop' }],
  };

  it('rewrites a real old layout and leaves section ids alone', () => {
    const out = migrateNavItemIds(old);
    expect(out).toEqual({
      version: 1,
      sectionOrder: ['section:sales', 'section:more'],
      itemOrder: {
        'section:sales': ['item:commerce:Customer', 'item:commerce:Order'],
        'section:more': ['item:commerce:ProductionOrder'],
      },
      hidden: ['item:commerce:Invoice', 'section:more'],
      moved: {
        'item:commerce:Order': 'custom:shop',
        'item:commerce:ProductionOrder': 'section:sales',
      },
      items: { 'item:commerce:Order': { label: 'Work orders' } },
      customSections: [{ id: 'custom:shop', label: 'Shop' }],
    });
  });

  it('is idempotent and keeps unknown ids', () => {
    const once = migrateNavItemIds(old);
    expect(migrateNavItemIds(once)).toEqual(once);
    const odd = { version: 1 as const, hidden: ['plain', 'dock:tool'] };
    expect(migrateNavItemIds(odd)).toEqual(odd);
  });

  it('runs when a blueprint is loaded', () => {
    const result = parseBlueprint({
      version: 1,
      recipes: [],
      policies: [],
      layout: old,
    });
    expect(result.ok && result.blueprint.layout?.hidden).toEqual([
      'item:commerce:Invoice',
      'section:more',
    ]);
  });
});
