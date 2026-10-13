/**
 * The record page's data (smrt#3718 record page): documents named by their
 * identifier, the records loader's table cells and totals, and the sample
 * documents' line items and totals.
 */
import { describe, expect, it } from 'vitest';
import { catalog } from '../src/lib/catalog/index.ts';
import {
  identifierField,
  recordHeading,
  recordName,
} from '../src/lib/data/display.ts';
import { createMemoryDataSource } from '../src/lib/data/source.ts';
import { plannerLoaders } from '../src/lib/overviews/registry.ts';

const C = '@happyvertical/smrt-commerce:';
const CUSTOMER = `${C}Customer`;
const ORDER = `${C}Order`;
const INVOICE = `${C}Invoice`;
const PAYMENT = `${C}Payment`;

const model = (id: string) => {
  const found = catalog.packages
    .flatMap((p) => p.models)
    .find((m) => m.id === id);
  if (!found) throw new Error(`${id} missing from catalog`);
  return found;
};
function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`${what} missing`);
  return value;
}

describe('document labels', () => {
  const none = () => undefined;

  it('find the identifier by the framework roles, never on a named model', () => {
    expect(identifierField(model(ORDER))?.name).toBe('reference');
    expect(identifierField(model(INVOICE))?.name).toBe('invoiceNumber');
    expect(
      identifierField(model('@happyvertical/smrt-inventory:InventoryLocation')),
    ).toBeUndefined();
    expect(identifierField(model(CUSTOMER))).toBeUndefined();
  });

  it('name a document by its identifier and head its page with its kind', () => {
    const order = { id: 'o1', reference: 'GRA-3159', customerId: 'c1' };
    const party = () => 'Ridgeline Construction';
    const name = must(recordName(model(ORDER), order, party));
    expect(name).toBe('GRA-3159');
    expect(recordHeading(model(ORDER), order, name, 'Order')).toBe(
      'Order GRA-3159',
    );
    // No identifier: the party, amount and date of a money record.
    const payment = {
      id: 'p1',
      customerId: 'c1',
      amount: 7130,
      paidAt: '2026-03-04T00:00:00.000Z',
    };
    const paid = must(recordName(model(PAYMENT), payment, () => 'Ada'));
    expect(paid).toBe('Ada · $71.30 · 2026-03-04');
    expect(recordHeading(model(PAYMENT), payment, paid, 'Payment')).toBe(paid);
    expect(recordName(model(ORDER), { id: 'x' }, none)).toBeUndefined();
  });
});

describe('the records loader as a table', () => {
  const records = must(plannerLoaders.records, 'records loader');
  const href = (path: string) => `#${path}`;

  it('fills cells by role and totals every matching row, in minor units', async () => {
    const source = createMemoryDataSource();
    const [customer] = await source.list(model(CUSTOMER));
    const ctx = {
      overviewId: 'detail:commerce.Customer',
      source,
      href,
      record: { model: CUSTOMER, id: must(customer).id },
    };
    const options = {
      model: ORDER,
      filter: 'parent',
      field: 'customerId',
      limit: 2,
    };
    const data = await records(options, ctx as never);
    const all = await source.listWhere(
      model(ORDER),
      'customerId',
      must(customer).id,
    );
    expect(all.length).toBeGreaterThan(2);
    expect(data.rows).toHaveLength(2);
    // Default columns by role, the parent link left out.
    expect(data.columns?.map((c) => [c.key, c.role])).toEqual([
      ['reference', 'identifier'],
      ['status', 'status'],
      ['issueDate', 'date'],
      ['vendorId', 'party'],
    ]);
    expect(data.total).toBe(all.length);
    const row = must(data.rows[0]);
    const source0 = must(all.find((o) => o.id === row.id));
    expect(row.cells?.reference).toBe(source0.reference);
    expect(row.cells?.status).toBe(source0.status);
    // A reference reads as its record's name, never an id.
    expect(String(row.cells?.vendorId)).not.toBe(String(source0.vendorId));

    // Money columns sum over all matching rows, not the page.
    const money = await records(
      { ...options, columns: 'reference,totalAmount,subtotal' },
      ctx as never,
    );
    expect(money.columns?.map((c) => c.role)).toEqual([
      'identifier',
      'money',
      'money',
    ]);
    const sum = (key: string) =>
      all.reduce((total, o) => total + Number(o[key]), 0);
    expect(money.summaries).toEqual({
      totalAmount: sum('totalAmount'),
      subtotal: sum('subtotal'),
    });
    expect(Number.isInteger(money.summaries?.totalAmount)).toBe(true);
    expect(money.rows[0]?.cells?.totalAmount).toBe(
      all.find((o) => o.id === money.rows[0]?.id)?.totalAmount,
    );
    // A line table: the unit price is shown, never summed.
    const [order] = all;
    const lines = await records(
      {
        model: `${C}ContractLineItem`,
        filter: 'parent',
        field: 'contractId',
        columns: 'description,quantity,unitPrice,amount',
        limit: 50,
      },
      { ...ctx, record: { model: ORDER, id: must(order).id } } as never,
    );
    expect(lines.columns?.find((c) => c.key === 'unitPrice')).toMatchObject({
      role: 'money',
      summarize: false,
    });
    expect(Object.keys(lines.summaries ?? {}).sort()).toEqual([
      'amount',
      'quantity',
    ]);
    await expect(
      records({ ...options, columns: 'nope' }, ctx as never),
    ).rejects.toThrow(/no field nope/);
  });
});
