import { beforeEach, describe, expect, it } from 'vitest';
import { catalog, getModel } from '../src/lib/catalog/index.ts';
import { CookbookStore } from '../src/lib/cookbook/store.svelte.ts';
import { COOKBOOK_SCHEMA } from '../src/lib/cookbook/types.ts';
import { parseCookbookText } from '../src/lib/cookbook/validate.ts';
import {
  DEFAULT_SAMPLE_ROWS,
  fakeId,
  fakeRecords,
  relatedIndex,
  sampleRowCount,
} from '../src/lib/data/fakes.ts';
import { createMemoryDataSource } from '../src/lib/data/source.ts';
import {
  detailOverview,
  detailOverviewFor,
  detailOverviewId,
  detailOverviewModel,
  isOverviewId,
  overviewDefinition,
} from '../src/lib/overviews/definitions.ts';
import {
  createSectionOverview,
  loadSectionWidget,
} from '../src/lib/overviews/page.ts';
import { checkStoredOverride } from '../src/lib/overviews/validate.ts';
import {
  filteredListPath,
  parseModelRoute,
  recordFilter,
  recordFilterQuery,
  recordPath,
  splitRoute,
} from '../src/lib/planner/routes.ts';
import { hasNavKey, recipesById } from '../src/lib/recipes/index.ts';
import {
  childLinks,
  forwardLinks,
  reverseLinks,
} from '../src/lib/recipes/plumbing.ts';
import { recipeState } from '../src/lib/recipes/state.svelte.ts';
import {
  screenDefinition,
  screenPolicy,
} from '../src/lib/screens/definition.ts';
import {
  appModels,
  referenceLabel,
  screenRelations,
} from '../src/lib/screens/relations.ts';

const CUSTOMER = '@happyvertical/smrt-commerce:Customer';
const ORDER = '@happyvertical/smrt-commerce:Order';
const INVOICE = '@happyvertical/smrt-commerce:Invoice';

const model = (id: string) => {
  const found = catalog.packages
    .flatMap((p) => p.models)
    .find((m) => m.id === id);
  if (!found) throw new Error(`${id} missing from catalog`);
  return found;
};
/** The value, or a failed test naming what was missing. */
function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`${what} missing`);
  return value;
}
const sales = recipesById.get('commerce.sales');
if (!sales) throw new Error('commerce.sales missing');

describe('record routes', () => {
  const isKey = (_pkg: string, _model: string, key: string) => key === 'quotes';

  it('spell the view, edit and filtered-list paths', () => {
    expect(recordPath('commerce', 'Customer', 'abc')).toBe(
      '/m/commerce/Customer/abc/',
    );
    expect(recordPath('commerce', 'Customer', 'abc', 'edit')).toBe(
      '/m/commerce/Customer/abc/edit/',
    );
    expect(filteredListPath('commerce', 'Order', 'customerId', 'a b')).toBe(
      '/m/commerce/Order/?customerId=a%20b',
    );
  });

  it('read a list, a keyed entry, a record view and its edit page', () => {
    expect(parseModelRoute(['commerce', 'Order'], isKey)).toEqual({
      packageId: 'commerce',
      modelName: 'Order',
    });
    expect(parseModelRoute(['commerce', 'Order', 'quotes'], isKey)).toEqual({
      packageId: 'commerce',
      modelName: 'Order',
      view: 'quotes',
    });
    expect(parseModelRoute(['commerce', 'Order', 'abc'], isKey)).toEqual({
      packageId: 'commerce',
      modelName: 'Order',
      recordId: 'abc',
      mode: 'view',
    });
    expect(
      parseModelRoute(['commerce', 'Order', 'abc', 'edit'], isKey),
    ).toEqual({
      packageId: 'commerce',
      modelName: 'Order',
      recordId: 'abc',
      mode: 'edit',
    });
    // Not model pages: a keyed entry has no edit page, nothing goes deeper.
    expect(
      parseModelRoute(['commerce', 'Order', 'quotes', 'edit'], isKey),
    ).toBe(undefined);
    expect(parseModelRoute(['commerce', 'Order', 'abc', 'x'], isKey)).toBe(
      undefined,
    );
    expect(
      parseModelRoute(['commerce', 'Order', 'abc', 'edit', 'more'], isKey),
    ).toBe(undefined);
    expect(parseModelRoute(['commerce'], isKey)).toBe(undefined);
  });

  it('tell a keyed nav entry from a record id with the real recipes', () => {
    expect(hasNavKey('products', 'Product', 'ingredients')).toBe(true);
    expect(hasNavKey('products', 'Product', 'abc')).toBe(false);
    expect(
      parseModelRoute(['products', 'Product', 'ingredients'], hasNavKey),
    ).toMatchObject({ view: 'ingredients' });
    expect(
      parseModelRoute(['products', 'Product', 'abc', 'edit'], hasNavKey),
    ).toMatchObject({ recordId: 'abc', mode: 'edit' });
  });

  it('split a fragment route and read the record filter from its query', () => {
    expect(splitRoute('/m/commerce/Order/?customerId=c1')).toEqual({
      path: '/m/commerce/Order/',
      search: '?customerId=c1',
    });
    expect(splitRoute('/m/commerce/Order/')).toEqual({
      path: '/m/commerce/Order/',
      search: '',
    });
    const order = model(ORDER);
    expect(recordFilter('?customerId=c1&p=commerce', order)).toEqual({
      field: 'customerId',
      equals: 'c1',
    });
    // Only a reference field filters; the selection and an empty value do not.
    expect(recordFilter('?p=commerce&status=open', order)).toBeUndefined();
    expect(recordFilter('?customerId=', order)).toBeUndefined();
    expect(recordFilterQuery({ field: 'customerId', equals: 'c1' })).toBe(
      'customerId=c1',
    );
    expect(recordFilterQuery(undefined)).toBe('');
  });
});

describe('reverse and forward links', () => {
  it('find every model pointing at a customer, plumbing or not', () => {
    const links = reverseLinks(catalog, CUSTOMER);
    const ids = links.map((l) => `${l.model.id}.${l.fk}`);
    expect(ids).toContain(`${ORDER}.customerId`);
    expect(ids).toContain(`${INVOICE}.customerId`);
    // The plumbing-only lookup does not list orders under a customer.
    expect(
      childLinks(catalog, [sales], CUSTOMER).map((l) => l.model.id),
    ).not.toContain(ORDER);
  });

  it('follow the STI lineage and list one link per field', () => {
    // ContractLineItem points at Contract, which Order extends.
    const ids = reverseLinks(catalog, ORDER).map(
      (l) => `${l.model.name}.${l.fk}`,
    );
    expect(ids).toContain('ContractLineItem.contractId');
    // One link per (model, field): no field is listed twice.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('point an order up at its customer and vendor', () => {
    const up = forwardLinks(catalog, ORDER).map(
      (l) => `${l.fk}->${l.model.name}`,
    );
    expect(up).toEqual(
      expect.arrayContaining(['customerId->Customer', 'vendorId->Vendor']),
    );
    expect(forwardLinks(catalog, 'nope:Nope')).toEqual([]);
  });
});

describe('screen relations', () => {
  it('confine a record view to the models in the app', () => {
    const inApp = appModels([sales], []);
    expect(inApp.has(ORDER)).toBe(true);
    const relations = screenRelations(catalog, CUSTOMER, inApp);
    const children = relations.filter((r) => r.kind === 'children');
    expect(children.map((r) => r.model)).toContain(ORDER);
    for (const relation of children)
      expect(inApp.has(relation.model)).toBe(true);
    // Nothing in the app points at a customer except through sales.
    expect(screenRelations(catalog, CUSTOMER, new Set())).toEqual([]);
  });

  it('label children by their plural name and references by their field', () => {
    const all = new Set(
      catalog.packages.flatMap((p) => p.models.map((m) => m.id)),
    );
    const relations = screenRelations(catalog, ORDER, all);
    const lines = relations.find(
      (r) => r.kind === 'children' && r.model.endsWith(':ContractLineItem'),
    );
    expect(lines).toMatchObject({ field: 'contractId', label: 'Line items' });
    expect(relations).toContainEqual({
      model: CUSTOMER,
      field: 'customerId',
      label: 'Customer',
      kind: 'reference',
    });
    expect(referenceLabel('fromLocationId')).toBe('From location');
  });

  it('build a screen definition and policy from the catalog model', () => {
    const order = model(ORDER);
    const definition = screenDefinition(order);
    expect(definition).toMatchObject({
      name: order.collection,
      objectRef: ORDER,
      className: 'Order',
    });
    expect(definition.fields.customerId).toMatchObject({ type: 'foreignKey' });
    expect(definition.relationships).toContainEqual({
      field: 'customerId',
      kind: 'foreignKey',
      relatedCollection: model(CUSTOMER).collection,
    });
    const policy = screenPolicy(order, [
      { ...must(order.fields[0]), label: 'First', help: 'Why' },
    ]);
    expect(Object.keys(policy.fields)).toEqual([must(order.fields[0]).name]);
    expect(policy.fields[must(order.fields[0]).name]).toMatchObject({
      visibility: 'basic',
      label: 'First',
      help: 'Why',
    });
  });
});

describe('sample relations', () => {
  it('spread over every row of the target, deterministically', () => {
    const customerId = must(
      model(ORDER).fields.find((f) => f.name === 'customerId'),
    );
    const seen = new Set(
      Array.from({ length: 16 }, (_, index) =>
        relatedIndex(customerId, { modelId: ORDER, index }),
      ),
    );
    expect(seen.size).toBe(sampleRowCount(CUSTOMER, DEFAULT_SAMPLE_ROWS));
    expect(relatedIndex(customerId, { modelId: ORDER, index: 9 })).toBe(
      relatedIndex(customerId, { modelId: ORDER, index: 9 }),
    );
  });

  it('give each sample customer several orders, 3 to 6, unevenly', async () => {
    const source = createMemoryDataSource();
    const customers = await source.list(model(CUSTOMER));
    const orders = await source.list(model(ORDER));
    const counts = customers.map(
      (c) => orders.filter((o) => o.customerId === c.id).length,
    );
    for (const count of counts) {
      expect(count).toBeGreaterThanOrEqual(3);
      expect(count).toBeLessThanOrEqual(6);
    }
    expect(new Set(counts).size).toBeGreaterThan(1);
    expect(orders.length).toBe(sampleRowCount(ORDER, DEFAULT_SAMPLE_ROWS));
    // Every customer has invoices too.
    const invoices = await source.list(model(INVOICE));
    const invoiced = new Set(invoices.map((i) => String(i.customerId)));
    expect(invoiced.size).toBe(customers.length);
  });

  it('give every sample customer orders, pointing at real rows', async () => {
    const source = createMemoryDataSource();
    const customers = await source.list(model(CUSTOMER));
    const orders = await source.list(model(ORDER));
    const ids = new Set(customers.map((c) => c.id));
    for (const order of orders)
      expect(ids.has(String(order.customerId))).toBe(true);
    const withOrders = customers.filter((c) =>
      orders.some((o) => o.customerId === c.id),
    );
    expect(withOrders.length).toBe(customers.length);
    expect(must(fakeRecords(model(ORDER), 3)[1]).customerId).toBe(
      fakeId(`${CUSTOMER}:1`),
    );
  });

  it('listWhere returns the rows pointing at a record, as copies', async () => {
    const source = createMemoryDataSource();
    const [customer] = await source.list(model(CUSTOMER));
    const orders = await source.listWhere(
      model(ORDER),
      'customerId',
      must(customer).id,
    );
    expect(orders.length).toBeGreaterThan(0);
    for (const order of orders)
      expect(order.customerId).toBe(must(customer).id);
    expect(await source.listWhere(model(ORDER), 'customerId', 'nope')).toEqual(
      [],
    );
  });
});

describe('detail overviews', () => {
  beforeEach(() => recipeState.clear());

  const id = detailOverviewId('commerce', 'Customer');
  const href = (path: string) => `#${path}`;
  const context = (recordId: string) => ({
    source: createMemoryDataSource(),
    sections: [],
    entries: new Map(),
    href,
    record: { model: CUSTOMER, id: recordId },
  });

  it('are keyed detail:<pkg>.<Model> for exposed catalog models only', () => {
    expect(id).toBe('detail:commerce.Customer');
    expect(detailOverviewModel(id)?.model.id).toBe(CUSTOMER);
    expect(isOverviewId(id)).toBe(true);
    expect(isOverviewId('detail:commerce.Nope')).toBe(false);
    // The framework's own key for the same model (`recordOverviewId`).
    const framework = 'detail:happyvertical.smrt-commerce.Customer';
    expect(detailOverviewModel(framework)?.model.id).toBe(CUSTOMER);
    expect(isOverviewId(framework)).toBe(true);
    expect(
      checkStoredOverride(framework, { version: 1, removed: ['w1'] }).override,
    ).toEqual({ version: 1, removed: ['w1'] });
    expect(isOverviewId('detail:commerce')).toBe(false);
    expect(detailOverview('detail:commerce.Nope')).toBeUndefined();
    expect(overviewDefinition(id)?.id).toBe(id);
  });

  it('default to a count and the newest records per relation, confined to the app', () => {
    const full = must(detailOverview(id));
    const orders = full.defaults.filter((w) => w.options.model === ORDER);
    expect(orders.map((w) => w.type).sort()).toEqual(['metric', 'records']);
    expect(orders.find((w) => w.type === 'records')?.options).toMatchObject({
      filter: 'parent',
      field: 'customerId',
    });
    const narrowed = must(detailOverviewFor(id, appModels([sales], [])));
    expect(narrowed.defaults.length).toBeLessThan(full.defaults.length);
    for (const widget of narrowed.defaults) {
      expect(appModels([sales], []).has(String(widget.options.model))).toBe(
        true,
      );
    }
    // The same ids whichever recipes are on.
    const ids = new Set(full.defaults.map((w) => w.id));
    for (const widget of narrowed.defaults)
      expect(ids.has(widget.id)).toBe(true);
  });

  it('load a relation panel for the record, linking rows and View all', async () => {
    const definition = must(detailOverview(id));
    const ctx = context('');
    const [customer] = await ctx.source.list(model(CUSTOMER));
    const records = must(
      definition.defaults.find(
        (w) => w.type === 'records' && w.options.model === ORDER,
      ),
    );
    const data = (await loadSectionWidget(
      definition,
      context(must(customer).id),
      records,
    )) as {
      rows: { id: string; href?: string }[];
      href: string;
    };
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.href).toBe(
      `#/m/commerce/Order/?customerId=${must(customer).id}`,
    );
    expect(data.rows[0]?.href).toBe(`#/m/commerce/Order/${data.rows[0]?.id}/`);
    const orders = await ctx.source.listWhere(
      model(ORDER),
      'customerId',
      must(customer).id,
    );
    for (const row of data.rows) {
      expect(orders.some((o) => o.id === row.id)).toBe(true);
    }
    const metric = must(
      definition.defaults.find(
        (w) => w.type === 'metric' && w.options.model === ORDER,
      ),
    );
    const count = (await loadSectionWidget(
      definition,
      context(must(customer).id),
      metric,
    )) as {
      value: number;
    };
    expect(count.value).toBe(orders.length);
    // The parent filter needs a record; any other filter name is refused.
    await expect(
      loadSectionWidget(definition, { ...ctx, record: undefined }, records),
    ).rejects.toThrow();
  });

  it('keep a stored override through validation, export and import', () => {
    const store = new CookbookStore();
    const definition = must(detailOverview(id));
    const controller = createSectionOverview(definition, store);
    expect(controller.add('note', { body: 'Call before noon' }).ok).toBe(true);
    const override = store.overview(id);
    expect(override).not.toBeNull();
    expect(checkStoredOverride(id, override).override).toEqual(override);
    const text = JSON.stringify({
      $schema: COOKBOOK_SCHEMA,
      version: 1,
      recipes: ['commerce.sales'],
      features: [],
      policies: [],
      overviews: { [id]: override, 'detail:commerce.Nope': override },
    });
    const imported = parseCookbookText(text);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.cookbook.overviews?.[id]).toEqual(override);
    expect(imported.cookbook.overviews).not.toHaveProperty(
      'detail:commerce.Nope',
    );
    expect(imported.dropped?.join(' ')).toMatch(/detail:commerce.Nope/);
  });

  it('getModel agrees with the detail id', () => {
    expect(getModel('commerce', 'Customer')?.id).toBe(CUSTOMER);
  });
});
