import { describe, expect, it } from 'vitest';
import { catalog, getModelByQualifiedName } from '../src/lib/catalog/index.ts';
import { blankChild, rowsOf } from '../src/lib/data/columns.ts';
import { createMemoryDataSource } from '../src/lib/data/source.ts';
import { recipes } from '../src/lib/recipes/index.ts';
import {
  childLinks,
  childTitle,
  hasNavPage,
  lineageNames,
} from '../src/lib/recipes/plumbing.ts';

const C = '@happyvertical/smrt-commerce:';
const names = (id: string) =>
  childLinks(catalog, recipes, id).map((l) => `${l.model.name}.${l.fk}`);

describe('childLinks', () => {
  it('puts line items under every Contract subtype', () => {
    for (const parent of [
      'Agreement',
      'Order',
      'PurchaseOrder',
      'Estimate',
      'WholesaleOrder',
    ]) {
      expect(names(`${C}${parent}`)).toContain('ContractLineItem.contractId');
    }
  });

  it('gives an Invoice its lines and payment allocations', () => {
    expect(names(`${C}Invoice`).sort()).toEqual([
      'InvoiceLineItem.invoiceId',
      'PaymentAllocation.invoiceId',
    ]);
  });

  it('nests fulfilment lines and journal entries', () => {
    expect(names(`${C}Fulfillment`)).toContain(
      'FulfillmentLineItem.fulfillmentId',
    );
    expect(names('@happyvertical/smrt-ledgers:Journal')).toEqual([
      'JournalEntry.journalId',
    ]);
  });

  it('never treats a model with its own menu entry as a child', () => {
    // Issue points at Project but is a nav page of the tracker recipe.
    expect(names('@happyvertical/smrt-projects:Project')).not.toContain(
      'Issue.projectId',
    );
    expect(hasNavPage(recipes, '@happyvertical/smrt-projects:Issue')).toBe(
      true,
    );
    expect(hasNavPage(recipes, `${C}ContractLineItem`)).toBe(false);
  });

  it('falls back to plumbing-shaped models for a model in no recipe', () => {
    const inRecipe = new Set(recipes.flatMap((r) => r.models));
    const parent = catalog.packages
      .flatMap((p) => p.models)
      .find(
        (m) => !inRecipe.has(m.id) && childLinks(catalog, [], m.id).length > 0,
      );
    expect(parent).toBeDefined();
  });
});

describe('childTitle', () => {
  it('drops the parent prefix and pluralises', () => {
    const parents = lineageNames(catalog, `${C}Agreement`);
    expect(parents).toEqual(['Agreement', 'Contract']);
    expect(childTitle('ContractLineItem', parents)).toBe('Line items');
    expect(childTitle('InvoiceLineItem', ['Invoice'])).toBe('Line items');
    expect(childTitle('PaymentAllocation', ['Invoice'])).toBe(
      'Payment allocations',
    );
    expect(childTitle('JournalEntry', ['Journal'])).toBe('Entries');
  });
});

describe('child rows in a record view', () => {
  const lineItem = getModelByQualifiedName(`${C}ContractLineItem`)?.model;

  it('shows only rows whose foreign key points at the record', async () => {
    if (!lineItem) throw new Error('ContractLineItem missing');
    const source = createMemoryDataSource({ empty: [lineItem.id] });
    await source.create(lineItem, { contractId: 'a', description: 'one' });
    await source.create(lineItem, { contractId: 'b', description: 'two' });
    const rows = rowsOf(await source.list(lineItem), 'contractId', 'a');
    expect(rows.map((r) => r.description)).toEqual(['one']);
  });

  it('presets the foreign key on a new child', () => {
    const blank = blankChild([], 'contractId', 'parent-1');
    expect(blank.contractId).toBe('parent-1');
  });
});
