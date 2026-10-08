import type { CatalogModel } from '../catalog/types.ts';
import { isRelation } from '../fields/renderer.ts';
import type { ViewField } from '../recipes/policy.ts';
import { displayLabel } from './display.ts';
import { labelKey } from './format.ts';

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

/**
 * The value a new record starts with: the field's default; an enumeration with
 * none (a `status`, or a required choice) starts at "draft" or its first value
 * rather than empty.
 */
export function blankValue(field: ViewField): unknown {
  if (field.default !== undefined && field.default !== null) {
    return field.default;
  }
  const choices = field.enum ?? [];
  if (
    choices.length > 0 &&
    (field.required || /(status|state|stage)$/i.test(field.name))
  ) {
    return choices.includes('draft') ? 'draft' : choices[0];
  }
  if (field.type === 'boolean') return false;
  return field.type === 'text' ? '' : null;
}

/** Starting values for a new record of the fields shown. */
export function blankRecord(
  fields: readonly ViewField[],
): Record<string, unknown> {
  const blank: Record<string, unknown> = {};
  for (const field of fields) blank[field.name] = blankValue(field);
  return blank;
}

/** Starting values for a new child row: field defaults, the foreign key preset. */
export function blankChild(
  fields: readonly ViewField[],
  fk: string,
  parentId: string,
): Record<string, unknown> {
  return { ...blankRecord(fields), [fk]: parentId };
}

const isEmpty = (value: unknown) =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim() === '');

/**
 * Required fields without a value, as `{ name: message }`. A switch always has
 * a value; fields in `skip` (derived or preset ones) are not asked for.
 */
export function missingRequired(
  fields: readonly ViewField[],
  values: Readonly<Record<string, unknown>>,
  skip: ReadonlySet<string> = new Set(),
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!field.required || field.type === 'boolean' || skip.has(field.name)) {
      continue;
    }
    if (isEmpty(values[field.name]))
      errors[field.name] = `${field.label} is required.`;
  }
  return errors;
}

const REFERENCE_FIELD = /^(reference|number|description)$/i;

/**
 * What names a record to a person: its label field, else the record it points
 * at first (an agreement's customer), plus its reference or description.
 */
export function recordTitle(
  model: CatalogModel,
  fields: readonly ViewField[],
  row: Readonly<Record<string, unknown>>,
  labels: ReadonlyMap<string, string>,
): string {
  const own = displayLabel(model, row);
  const related = fields
    .filter(isRelation)
    .map((f) =>
      f.related && typeof row[f.name] === 'string'
        ? labels.get(labelKey(f.related, row[f.name]))
        : undefined,
    )
    .find((label): label is string => Boolean(label));
  const reference = fields
    .filter((f) => REFERENCE_FIELD.test(f.name))
    .map((f) => row[f.name])
    .find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return [own ?? related, reference].filter(Boolean).join(' · ');
}

/** A child table shown inside its parent's record view. */
export interface ChildTable {
  model: CatalogModel;
  fields: ViewField[];
  /** The child's field holding the parent record's id. */
  fk: string;
  title: string;
}
