import type { CatalogModel } from '../catalog/types.ts';
import {
  createRandom,
  fakeId,
  fakeRecord,
  hashString,
  type ModelRecord,
} from './fakes.ts';

/** A child model and the field holding its parent's id (see `childLinks`). */
export interface ChildOf {
  model: CatalogModel;
  fk: string;
}

const MAX_CHILDREN = 4;

const hasField = (model: CatalogModel, name: string) =>
  model.fields.some((f) => f.name === name);

/**
 * Sample child rows for one parent record: one to four (journals, an even
 * number of balanced entries), each pointing at the parent through `fk`. Ids
 * and values are seeded from the parent's id, so the same parent always gets
 * the same children. A line item's `amount` is `quantity * unitPrice` so it
 * reads right next to the parent's totals.
 */
export function fakeChildrenOf(
  child: CatalogModel,
  fk: string,
  parent: ModelRecord,
  seed: number,
): ModelRecord[] {
  const random = createRandom(hashString(`${seed}:${child.id}:${parent.id}`));
  const ledger = hasField(child, 'debit') && hasField(child, 'credit');
  const count = ledger
    ? 2 * (1 + Math.floor(random() * 2))
    : 1 + Math.floor(random() * MAX_CHILDREN);
  const lines = hasField(child, 'unitPrice') && hasField(child, 'amount');
  const balance = 1000 * (1 + Math.floor(random() * 90));
  return Array.from({ length: count }, (_, i) => {
    const record: ModelRecord = {
      ...fakeRecord(child, hashString(`${parent.id}:${i}`) % 997, seed),
      id: fakeId(`${child.id}:${parent.id}:${i}`),
      [fk]: parent.id,
    };
    if (hasField(child, 'sortOrder')) record.sortOrder = i;
    if (lines) {
      const quantity = 1 + Math.floor(random() * 5);
      if (hasField(child, 'quantity')) record.quantity = quantity;
      if (hasField(child, 'discount')) record.discount = 0;
      record.amount = quantity * Number(record.unitPrice ?? 0);
    }
    if (ledger) {
      const debit = i % 2 === 0;
      record.debit = debit ? balance / 100 : 0;
      record.credit = debit ? 0 : balance / 100;
    }
    return record;
  });
}

/**
 * Bring a parent's totals in line with the line items just generated for it:
 * `subtotal` is their sum, `totalAmount` adds the parent's own tax.
 */
export function syncTotals(
  parent: ModelRecord,
  parentModel: CatalogModel,
  items: readonly ModelRecord[],
): void {
  if (!items.length || !items.every((r) => 'unitPrice' in r)) return;
  const subtotal = items.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  if (hasField(parentModel, 'subtotal')) parent.subtotal = subtotal;
  if (hasField(parentModel, 'totalAmount')) {
    parent.totalAmount = subtotal + Number(parent.taxAmount ?? 0);
  }
}
