/**
 * Amounts the commerce models derive rather than take as input, mirrored from
 * `ContractLineItem` / `InvoiceLineItem` / `Invoice` in smrt-commerce:
 *
 *   line subtotal = round(quantity * unitPrice) - discount   (minor units)
 *   line tax      = round(line subtotal * taxRate)           (taxRate is a fraction)
 *   line amount   = line subtotal + line tax
 *
 * and a parent with line items takes `subtotal`, `taxAmount` and `totalAmount`
 * from the sum of its lines, ignoring what a form sent.
 */
import type { CatalogModel } from '../catalog/types.ts';

type Row = Readonly<Record<string, unknown>>;

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const has = (model: CatalogModel, name: string) =>
  model.fields.some((f) => f.name === name);

/** A line item: it prices a quantity of something. */
export function isLineModel(model: CatalogModel): boolean {
  return ['quantity', 'unitPrice', 'amount'].every((n) => has(model, n));
}

export interface LineAmounts {
  subtotal: number;
  tax: number;
  amount: number;
}

export function lineAmounts(line: Row): LineAmounts {
  const subtotal =
    Math.round(num(line.quantity) * num(line.unitPrice)) - num(line.discount);
  const tax = Math.round(subtotal * num(line.taxRate));
  return { subtotal, tax, amount: subtotal + tax };
}

/** The line with its `amount` brought in line with its other fields. */
export function settleLine<T extends Row>(line: T): T & { amount: number } {
  return { ...line, amount: lineAmounts(line).amount };
}

export interface ParentTotals {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

export function totalsOf(lines: readonly Row[]): ParentTotals {
  let subtotal = 0;
  let taxAmount = 0;
  for (const line of lines) {
    const parts = lineAmounts(line);
    subtotal += parts.subtotal;
    taxAmount += parts.tax;
  }
  return { subtotal, taxAmount, totalAmount: subtotal + taxAmount };
}

export const TOTAL_FIELDS = ['subtotal', 'taxAmount', 'totalAmount'] as const;

/** `row` with the model's total fields set from `lines`. */
export function withTotals<T extends Record<string, unknown>>(
  model: CatalogModel,
  row: T,
  lines: readonly Row[],
): T {
  const totals = totalsOf(lines);
  const next: Record<string, unknown> = { ...row };
  for (const name of TOTAL_FIELDS) {
    if (has(model, name)) next[name] = totals[name];
  }
  return next as T;
}

/**
 * The fields a form shows but does not let anyone type: a line's `amount`, and
 * a parent's totals when it has line items.
 */
export function derivedFieldNames(
  model: CatalogModel,
  hasLineChildren: boolean,
): ReadonlySet<string> {
  const names = new Set<string>();
  if (isLineModel(model)) names.add('amount');
  if (hasLineChildren) {
    for (const name of TOTAL_FIELDS) if (has(model, name)) names.add(name);
  }
  return names;
}
