import { describe, expect, it } from 'vitest';
import { migrateLegacySections } from '../src/lib/blueprint/migrate.ts';
import { parseBlueprint } from '../src/lib/blueprint/validate.ts';
import {
  buildNavSections,
  legacyNavSectionKeys,
  navSectionOf,
  recipes,
  recipesById,
} from '../src/lib/recipes/index.ts';

const get = (id: string) => {
  const recipe = recipesById.get(id);
  if (!recipe) throw new Error(id);
  return recipe;
};

describe('suggested nav sections', () => {
  it.each([
    ['commerce.customers', 'sales'],
    ['commerce.sales', 'sales'],
    ['commerce.vendors', 'purchasing'],
    ['commerce.purchases', 'purchasing'],
    ['products.simple', 'catalog'],
    ['products.clothing', 'catalog'],
    ['inventory.stock', 'catalog'],
  ])('%s suggests %s', (id, section) => {
    expect(navSectionOf(get(id)).id).toBe(section);
  });

  it('falls back to the group, then the recipe', () => {
    const base = get('commerce.customers');
    const { section: _s, ...bare } = base;
    expect(navSectionOf(bare)).toEqual({ id: base.id, label: base.label });
    const grouped = { ...bare, group: { id: 'g', label: 'G' } };
    expect(navSectionOf(grouped)).toEqual({ id: 'g', label: 'G' });
  });

  it('merges recipes suggesting one section, in declaration order', () => {
    const built = buildNavSections([
      get('commerce.customers'),
      get('products.simple'),
      get('commerce.sales'),
    ]);
    expect(built.map((s) => [s.id, s.recipes.map((r) => r.id)])).toEqual([
      ['sales', ['commerce.customers', 'commerce.sales']],
      ['catalog', ['products.simple']],
    ]);
  });

  it('keeps group (Options/Help) separate from the nav section', () => {
    expect(get('products.simple').group?.id).toBe('products');
    expect(navSectionOf(get('products.simple')).id).toBe('catalog');
  });
});

describe('migrateLegacySections', () => {
  const keys = legacyNavSectionKeys(recipes);

  it('maps old ids to the suggested sections', () => {
    expect(keys['commerce.customers']).toBe('sales');
    expect(keys.products).toBe('catalog');
  });

  it('rewrites section and item ids, merging and de-duplicating', () => {
    const out = migrateLegacySections(
      {
        version: 1,
        sectionOrder: [
          'section:products',
          'section:commerce.sales',
          'section:commerce.customers',
        ],
        itemOrder: {
          'section:commerce.customers': ['section:commerce.customers:p:M:A'],
          'section:commerce.sales': ['section:commerce.sales:p:M:B'],
        },
        hidden: [
          'section:commerce.vendors',
          'section:products:p:M:Hid',
          'plain',
        ],
        moved: { 'section:products:p:M:X': 'section:commerce.sales' },
        panels: { left: { visible: false } },
      },
      keys,
    );
    expect(out).toEqual({
      version: 1,
      sectionOrder: ['section:catalog', 'section:sales'],
      itemOrder: {
        'section:sales': ['section:sales:p:M:A', 'section:sales:p:M:B'],
      },
      hidden: ['section:catalog:p:M:Hid', 'plain'],
      moved: { 'section:catalog:p:M:X': 'section:sales' },
      panels: { left: { visible: false } },
    });
  });

  it('is idempotent and leaves unrelated ids alone', () => {
    const layout = {
      version: 1 as const,
      sectionOrder: ['section:sales', 'package:x'],
    };
    expect(migrateLegacySections(layout, keys)).toEqual(layout);
  });

  it('runs when a blueprint is loaded', () => {
    const result = parseBlueprint({
      version: 1,
      recipes: [],
      policies: [],
      layout: { version: 1, sectionOrder: ['section:commerce.vendors'] },
    });
    expect(result.ok && result.blueprint.layout?.sectionOrder).toEqual([
      'section:purchasing',
    ]);
  });
});
