import {
  SHELL_ICON_PATHS,
  SHELL_SECTION_ICONS,
} from '@happyvertical/smrt-svelte/workspace';
import { resolveShellNavModel } from '@happyvertical/smrt-svelte/workspace/layout';
import { describe, expect, it } from 'vitest';
import { cookbooks } from '../src/lib/cookbooks/index.ts';
import { blueprintNavGroups } from '../src/lib/cookbooks/menu.ts';
import { navNoun } from '../src/lib/data/format.ts';
import { createMemoryDataSource } from '../src/lib/data/source.ts';
import { requestCreate, takeCreate } from '../src/lib/planner/create.ts';
import { FEATURE_SECTION } from '../src/lib/recipes/features.ts';
import {
  buildNavSections,
  recipes,
  recipesById,
} from '../src/lib/recipes/index.ts';
import { inScope } from '../src/lib/recipes/scope.ts';
import { entryIndex, optionGroups } from '../src/lib/sections/entries.ts';
import { sectionInfo } from '../src/lib/sections/info.ts';
import {
  sectionIdFromSlug,
  sectionPath,
  sectionSlug,
} from '../src/lib/sections/path.ts';

const get = (id: string) => {
  const recipe = recipesById.get(id);
  if (!recipe) throw new Error(id);
  return recipe;
};
const isIcon = (name: string | undefined) =>
  !!name && Object.hasOwn(SHELL_ICON_PATHS, name);

describe('section icons and descriptions', () => {
  it('every suggested recipe section has a known icon and a description', () => {
    const navSections = buildNavSections(recipes);
    expect(navSections.length).toBeGreaterThan(5);
    for (const section of navSections) {
      expect(isIcon(section.icon), `${section.id} icon`).toBe(true);
      expect(
        section.description?.trim(),
        `${section.id} description`,
      ).toBeTruthy();
      expect(sectionInfo(`section:${section.id}`)).toEqual({
        icon: section.icon,
        description: section.description,
      });
    }
  });

  it('recipes sharing a section agree on its icon and description', () => {
    const seen = new Map<string, string>();
    for (const recipe of recipes) {
      const s = recipe.section;
      const shape = `${s?.icon}|${s?.description}`;
      expect(seen.get(s?.id ?? '') ?? shape, recipe.id).toBe(shape);
      seen.set(s?.id ?? '', shape);
    }
  });

  it('the More section has its own icon and description', () => {
    expect(isIcon(FEATURE_SECTION.icon)).toBe(true);
    expect(sectionInfo(`section:${FEATURE_SECTION.id}`).description).toBe(
      FEATURE_SECTION.description,
    );
  });

  it('every cookbook custom section has an icon (in its layout) and a description', () => {
    for (const cookbook of cookbooks) {
      const layout = cookbook.blueprint.layout;
      const ids = (layout?.customSections ?? []).map((s) => s.id);
      expect(ids.length, cookbook.id).toBeGreaterThan(0);
      for (const id of ids) {
        expect(
          isIcon(layout?.sections?.[id]?.icon),
          `${cookbook.id} ${id}`,
        ).toBe(true);
        expect(cookbook.sectionDescriptions?.[id]?.trim(), id).toBeTruthy();
        expect(sectionInfo(id).description).toBeTruthy();
      }
      expect(Object.keys(cookbook.sectionDescriptions ?? {}).sort()).toEqual(
        [...ids].sort(),
      );
    }
  });

  it('the picker offers the icons the data uses', () => {
    const used = new Set<string>();
    for (const s of buildNavSections(recipes)) if (s.icon) used.add(s.icon);
    for (const c of cookbooks) {
      for (const section of Object.values(c.blueprint.layout?.sections ?? {})) {
        if (section.icon) used.add(section.icon);
      }
    }
    for (const icon of used) expect(SHELL_SECTION_ICONS, icon).toContain(icon);
  });
});

describe('section page paths', () => {
  it('round-trips layout ids through colon-free slugs', () => {
    for (const id of [
      'section:sales',
      'custom:shop',
      'custom:shop-2',
      'package:commerce',
    ]) {
      expect(sectionSlug(id)).not.toContain(':');
      expect(sectionIdFromSlug(sectionSlug(id))).toBe(id);
    }
    expect(sectionPath('section:sales')).toBe('/s/section-sales/');
  });
});

describe('a section page lists its entries', () => {
  for (const cookbook of cookbooks) {
    it(`${cookbook.id}: applied order, renames and hides, each backed by an entry`, () => {
      const { blueprint } = cookbook;
      const groups = blueprintNavGroups(blueprint);
      const model = resolveShellNavModel([], groups, blueprint.layout);
      const added = blueprint.recipes.flatMap((id) => {
        const recipe = recipesById.get(id);
        return recipe ? [recipe] : [];
      });
      const index = entryIndex(added, blueprint.features);
      const first = model.find(
        (s) => s.id === blueprint.layout?.sectionOrder?.[0],
      );
      expect(first, 'first section').toBeDefined();
      for (const section of model.slice(1)) {
        const shown = section.items.filter((i) => !i.hidden);
        // Row order is the layout's itemOrder for the section.
        const ordered = blueprint.layout?.itemOrder?.[section.id];
        if (ordered) {
          expect(shown.map((i) => i.id).slice(0, ordered.length)).toEqual(
            ordered.filter((id) => shown.some((i) => i.id === id)),
          );
        }
        for (const item of shown) {
          expect(index.has(item.id), `${section.id} ${item.id}`).toBe(true);
          const label = blueprint.layout?.items?.[item.id]?.label;
          if (label) expect(item.label).toBe(label);
        }
      }
    });
  }

  it('labels the New button from the shown label or the entry noun', () => {
    expect(navNoun('Sales orders')).toBe('sales order');
    expect(navNoun('Stock levels', 'stock entry')).toBe('stock entry');
    // "series" is already singular; "sery" was a bug.
    expect(navNoun('Class series')).toBe('class series');
  });

  it('counts a filtered entry by the rows its own page lists', async () => {
    const added = ['products.simple', 'products.ingredients'].map(get);
    const index = entryIndex(added, []);
    const filtered = [...index.values()].find((e) => e.scope?.equals);
    const plain = [...index.values()].find(
      (e) => e.model.id === filtered?.model.id && e.scope?.notIn,
    );
    if (!filtered || !plain) throw new Error('no filtered ingredients entry');
    const source = createMemoryDataSource({ rowsPerModel: 6 });
    const rows = await source.list(filtered.model);
    const mine = rows.filter((r) => inScope(filtered.scope, r)).length;
    const rest = rows.filter((r) => inScope(plain.scope, r)).length;
    expect(mine + rest).toBe(rows.length);
  });

  it('offers Options and Help for the groups behind a section', () => {
    const added = [
      'commerce.customers',
      'commerce.sales',
      'products.simple',
    ].map(get);
    const index = entryIndex(added, []);
    const sales = [...index.keys()].filter((id) => /Customer|Order/.test(id));
    const groups = optionGroups(sales, added);
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(groups.every((g) => g.id && g.label)).toBe(true);
    expect(optionGroups([], added)).toEqual([]);
  });
});

describe('New from a section page', () => {
  it('opens the create form once, on the page it named, and expires', () => {
    requestCreate('/m/commerce/Order/?p=commerce', 1000);
    expect(takeCreate('/m/commerce/Customer/', 1100)).toBe(false);
    // Taken (or refused) once: gone.
    expect(takeCreate('/m/commerce/Order/', 1200)).toBe(false);
    requestCreate('/m/commerce/Order/', 1000);
    expect(takeCreate('/m/commerce/Order/', 1200)).toBe(true);
    expect(takeCreate('/m/commerce/Order/', 1300)).toBe(false);
    requestCreate('/m/commerce/Order/', 1000);
    expect(takeCreate('/m/commerce/Order/', 9000)).toBe(false);
  });
});
