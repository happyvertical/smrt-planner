import { isRelation } from '../fields/renderer.ts';
import type { ViewField } from '../recipes/policy.ts';

/**
 * The columns of a list: a few leading fields, then the numeric/boolean/date
 * ones (prices, quantities, flags) and the choices (enums, relations) so a row
 * reads like a record, not a wall of text.
 */
export function listColumns(
  fields: readonly ViewField[],
  max = 6,
): ViewField[] {
  const shown = fields.filter((f) => f.type !== 'json');
  const lead = shown.slice(0, 3);
  const rest = shown
    .slice(3)
    .filter(
      (f) =>
        ['integer', 'decimal', 'boolean', 'datetime'].includes(f.type) ||
        (f.enum?.length ?? 0) > 0 ||
        isRelation(f),
    );
  return [...lead, ...rest].slice(0, max);
}

/** The rows whose foreign key points at the parent record. */
export function rowsOf<T extends Record<string, unknown>>(
  rows: readonly T[],
  fk: string,
  parentId: string,
): T[] {
  return rows.filter((r) => r[fk] === parentId);
}

/** Starting values for a new child row: field defaults, the foreign key preset. */
export function blankChild(
  fields: readonly ViewField[],
  fk: string,
  parentId: string,
): Record<string, unknown> {
  const blank: Record<string, unknown> = {};
  for (const field of fields) {
    blank[field.name] =
      field.default ??
      (field.type === 'boolean' ? false : field.type === 'text' ? '' : null);
  }
  blank[fk] = parentId;
  return blank;
}

/** A child table shown inside its parent's record view. */
export interface ChildTable {
  model: import('../catalog/types.ts').CatalogModel;
  fields: ViewField[];
  /** The child's field holding the parent record's id. */
  fk: string;
  title: string;
}
