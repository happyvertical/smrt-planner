import { afterEach, describe, expect, it } from 'vitest';
import { BlueprintStore } from '../src/lib/blueprint/store.svelte.ts';
import { parseBlueprint } from '../src/lib/blueprint/validate.ts';
import { getModelByQualifiedName } from '../src/lib/catalog/index.ts';
import {
  applyCookbook,
  holdsCookbook,
  isBlueprintEmpty,
  needsConfirm,
} from '../src/lib/cookbooks/apply.ts';
import {
  COOKBOOK_ICONS,
  cookbookRecipeLabels,
  cookbooks,
} from '../src/lib/cookbooks/index.ts';
import { blueprintNavGroups, previewMenu } from '../src/lib/cookbooks/menu.ts';
import type { CookbookLayout } from '../src/lib/cookbooks/types.ts';
import { recipesById } from '../src/lib/recipes/index.ts';
import { recipeState } from '../src/lib/recipes/state.svelte.ts';

const C = '@happyvertical/smrt-commerce:';

afterEach(() => recipeState.clear());

describe('cookbook data', () => {
  it('ships the four cookbooks with unique ids and known icons', () => {
    expect(cookbooks.map((c) => c.id)).toEqual([
      'bakery',
      'mechanic',
      'welder',
      'yoga-studio',
    ]);
    expect(new Set(cookbooks.map((c) => c.id)).size).toBe(cookbooks.length);
    for (const c of cookbooks) {
      expect(COOKBOOK_ICONS[c.icon]?.length, c.id).toBeGreaterThan(0);
      expect(c.name && c.summary).toBeTruthy();
    }
  });

  it.each(
    cookbooks.map((c) => [c.id, c] as const),
  )('%s is a valid blueprint that round-trips unchanged', (_id, cookbook) => {
    const parsed = parseBlueprint(cookbook.blueprint);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Requirements are already included and nothing was dropped.
    expect(parsed.blueprint.recipes).toEqual(cookbook.blueprint.recipes);
    expect(parsed.blueprint.features).toEqual(cookbook.blueprint.features);
    expect(parsed.blueprint.policies).toEqual(cookbook.blueprint.policies);
    for (const id of cookbook.blueprint.recipes) {
      expect(recipesById.has(id), id).toBe(true);
    }
    for (const ref of cookbook.blueprint.features) {
      expect(getModelByQualifiedName(ref)?.model.exposed, ref).toBe(true);
    }
  });

  it.each(
    cookbooks.map((c) => [c.id, c] as const),
  )('%s layout names only items the app generates, and places every one', (_id, cookbook) => {
    const layout = cookbook.blueprint.layout as CookbookLayout;
    const groups = blueprintNavGroups(cookbook.blueprint);
    const itemIds = new Set(
      groups.flatMap((g) => g.items.map((i) => i.id ?? i.href)),
    );
    const sectionIds = new Set([
      ...groups.map((g) => g.id ?? ''),
      ...(layout.customSections ?? []).map((s) => s.id),
    ]);
    const named = [
      ...Object.keys(layout.moved ?? {}),
      ...(layout.hidden ?? []),
      ...Object.keys(layout.items ?? {}),
      ...Object.values(layout.itemOrder ?? {}).flat(),
    ];
    for (const id of named) expect(itemIds.has(id), id).toBe(true);
    for (const id of layout.sectionOrder ?? []) {
      expect(sectionIds.has(id), id).toBe(true);
    }
    for (const to of Object.values(layout.moved ?? {})) {
      expect(sectionIds.has(to), to).toBe(true);
    }
    // Every item is moved into a cookbook section, hidden, or left in the
    // host's Accounting section on purpose.
    const placed = new Set([
      ...Object.keys(layout.moved ?? {}),
      ...(layout.hidden ?? []),
    ]);
    const left = [...itemIds].filter((id) => !placed.has(id));
    expect(left.every((id) => id.startsWith('section:accounting:'))).toBe(true);
  });

  it.each(
    cookbooks.map((c) => [c.id, c] as const),
  )('%s settings are the defaults new records start with', (_id, cookbook) => {
    recipeState.load(cookbook.blueprint);
    const { currency, paymentTerms, taxRate } = cookbook.settings;
    const value = (model: string, field: string) => {
      const found = getModelByQualifiedName(`${C}${model}`);
      const entry = found
        ? recipeState
            .apply(found.model)
            .resolved.find((r) => r.field.name === field)
        : undefined;
      return entry?.hasDefault ? entry.default : undefined;
    };
    const covered = new Set(
      cookbook.blueprint.recipes.flatMap(
        (id) => recipesById.get(id)?.models ?? [],
      ),
    );
    const has = (model: string) => covered.has(`${C}${model}`);
    for (const model of [
      'Order',
      'PurchaseOrder',
      'WholesaleOrder',
      'Estimate',
      'Invoice',
      'Agreement',
    ]) {
      if (has(model) && currency)
        expect(value(model, 'currency'), model).toBe(currency);
    }
    for (const model of [
      'Order',
      'WholesaleOrder',
      'Estimate',
      'Invoice',
      'Agreement',
    ]) {
      if (has(model) && paymentTerms)
        expect(value(model, 'terms'), model).toBe(paymentTerms);
    }
    if (paymentTerms)
      expect(value('Customer', 'paymentTerms')).toBe(paymentTerms);
    for (const model of ['ContractLineItem', 'InvoiceLineItem']) {
      if (has(model) && taxRate !== undefined)
        expect(value(model, 'taxRate'), model).toBe(taxRate);
    }
  });

  it('writes only the defaults each cookbook was asked for', () => {
    const settings = Object.fromEntries(
      cookbooks.map((c) => [c.id, c.settings]),
    );
    expect(settings.bakery).toEqual({
      currency: 'USD',
      paymentTerms: 'Net 15',
      taxRate: 0,
    });
    expect(settings.mechanic).toMatchObject({
      paymentTerms: 'Due on receipt',
      taxRate: 0.0825,
    });
    expect(settings.welder.paymentTerms).toBe(
      '50% deposit, balance on completion',
    );
    expect(settings['yoga-studio'].paymentTerms).toBe('Due on receipt');
  });
});

describe('cookbook preview', () => {
  const menu = (id: string) => {
    const c = cookbooks.find((x) => x.id === id);
    if (!c) throw new Error(id);
    return previewMenu(c.blueprint).map((s) => [
      s.label,
      s.entries.map((e) => e.label),
    ]);
  };

  it('shows the bakery menu in its own words', () => {
    expect(menu('bakery')).toEqual([
      ['Shop', ['Orders', 'Customers']],
      ['Wholesale', ['Cafe orders', 'Invoices', 'Payments']],
      ['Kitchen', ['Products', 'Ingredients', 'Batches']],
      ['Buying', ['Suppliers', 'Purchase Orders']],
      ['Accounting', ['Accounts', 'Journals']],
    ]);
  });

  it('shows the sections each trade asked for', () => {
    const names = (id: string) => menu(id).map(([label]) => label);
    expect(names('mechanic')).toEqual([
      'Jobs',
      'Parts',
      'Billing',
      'Schedule',
      'Accounting',
    ]);
    expect(names('welder')).toEqual([
      'Jobs',
      'Material',
      'Billing',
      'Schedule',
      'Accounting',
    ]);
    expect(names('yoga-studio')).toEqual([
      'Classes',
      'Members',
      'Shop',
      'Billing',
      'Accounting',
    ]);
    expect(menu('yoga-studio')[0]).toEqual([
      'Classes',
      ['Classes', 'Class series', 'Class types'],
    ]);
    expect(menu('mechanic')[0]).toEqual([
      'Jobs',
      ['Quotes', 'Work orders', 'Customers'],
    ]);
  });

  it('lists recipe chips by label', () => {
    const bakery = cookbooks[0];
    expect(cookbookRecipeLabels(bakery)).toContain('Wholesale orders');
    expect(cookbookRecipeLabels(bakery)).toHaveLength(
      bakery.blueprint.recipes.length,
    );
  });
});

describe('applying a cookbook', () => {
  const store = () => new BlueprintStore();

  it('replaces recipes, features, options and layout', () => {
    const s = store();
    recipeState.add('sales.pipeline');
    recipeState.addFeature(`${C}Cart`);
    s.setLayout({ version: 1, hidden: ['section:sales'] });
    const bakery = cookbooks[0];
    expect(applyCookbook(bakery, s).ok).toBe(true);
    const snap = s.snapshot();
    expect(snap.recipes).toEqual(bakery.blueprint.recipes);
    expect(snap.features).toEqual(bakery.blueprint.features);
    expect(snap.policies).toEqual(bakery.blueprint.policies);
    expect(snap.layout).toEqual(bakery.blueprint.layout);
    expect(recipeState.has('sales.pipeline')).toBe(false);
    expect(holdsCookbook(bakery, snap)).toBe(true);
  });

  it('asks first only when something is built', () => {
    const s = store();
    expect(isBlueprintEmpty(s.snapshot())).toBe(true);
    expect(needsConfirm(s)).toBe(false);
    recipeState.add('commerce.customers');
    expect(needsConfirm(s)).toBe(true);
    recipeState.clear();
    s.setLayout({ version: 1, hidden: ['x'] });
    expect(needsConfirm(s)).toBe(true);
  });

  it('applies one cookbook over another', () => {
    const s = store();
    applyCookbook(cookbooks[0], s);
    applyCookbook(cookbooks[3], s);
    expect(s.snapshot().recipes).toEqual(cookbooks[3].blueprint.recipes);
    expect(s.snapshot().features).toEqual([]);
    expect(holdsCookbook(cookbooks[0], s.snapshot())).toBe(false);
  });
});
