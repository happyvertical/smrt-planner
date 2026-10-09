import type { Recipe } from '../recipes/types.ts';
import type { AppSettings } from '../settings/app-settings.ts';
import { CURRENCY_CODES } from '../settings/currencies.ts';
import { formatTaxPercent } from './prompt.ts';

/** Settings as the model states them: tax in percent. All optional. */
export interface SettingsPatch {
  currency?: string;
  /** Percent, 0 to 100. */
  taxRate?: number;
  paymentTerms?: string;
}

/** Longest payment terms the assistant will write. */
export const MAX_TERMS_LENGTH = 40;

/**
 * What the model returns each turn: a reply, recipe ids to add or remove, an
 * optional cookbook to offer (never applied without a click) and optional
 * settings to change.
 */
export interface AssistantChange {
  reply: string;
  add: string[];
  remove: string[];
  cookbook: string | null;
  settings: SettingsPatch;
}

/** The slice of the blueprint store that holds the app settings. */
export interface SettingsStore {
  read(): AppSettings;
  write(settings: AppSettings): void;
}

/** The slice of the recipe store the assistant drives (the Planner cards use the same). */
export interface RecipeStore {
  readonly ids: readonly string[];
  add(...ids: string[]): void;
  remove(...ids: string[]): void;
}

/** The result of applying a change, after `requires` and `requiresAny` ran. */
export interface AppliedChange {
  /** Newly on, including recipes pulled in because another needs them. */
  added: string[];
  /** Newly off. */
  removed: string[];
  /** Asked to remove, but another added recipe needs them. */
  kept: string[];
}

/**
 * The JSON Schema for one turn. `add` and `remove` are enums of recipe ids,
 * so grammar-constrained decoding cannot produce an id that does not exist.
 */
export function buildResponseSchema(
  recipes: readonly Pick<Recipe, 'id'>[],
  cookbooks: readonly { id: string }[] = [],
  withSettings = false,
): Record<string, unknown> {
  const ids = recipes.map((recipe) => recipe.id);
  const list = { type: 'array', items: { enum: ids }, maxItems: ids.length };
  const properties: Record<string, unknown> = {
    reply: { type: 'string' },
    add: list,
    remove: list,
  };
  if (cookbooks.length) {
    properties.cookbook = { enum: [...cookbooks.map((c) => c.id), null] };
  }
  if (withSettings) {
    properties.settings = {
      type: 'object',
      properties: {
        currency: { type: 'string', pattern: '^[A-Z]{3}$' },
        taxRate: { type: 'number', minimum: 0, maximum: 100 },
        paymentTerms: { type: 'string', maxLength: MAX_TERMS_LENGTH },
      },
      additionalProperties: false,
    };
  }
  return {
    type: 'object',
    properties,
    required: ['reply', 'add', 'remove'],
    additionalProperties: false,
  };
}

/** Keep only valid settings: circulating currency, tax 0-100, short terms. */
function parseSettings(value: unknown): SettingsPatch {
  const out: SettingsPatch = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  const object = value as Record<string, unknown>;
  if (typeof object.currency === 'string') {
    const code = object.currency.trim().toUpperCase();
    if (CURRENCY_CODES.has(code)) out.currency = code;
  }
  const tax = object.taxRate;
  if (
    typeof tax === 'number' &&
    Number.isFinite(tax) &&
    tax >= 0 &&
    tax <= 100
  ) {
    out.taxRate = tax;
  }
  if (typeof object.paymentTerms === 'string') {
    const terms = [...object.paymentTerms]
      .map((ch) =>
        ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch,
      )
      .join('')
      .trim();
    if (terms && terms.length <= MAX_TERMS_LENGTH) out.paymentTerms = terms;
  }
  return out;
}

/**
 * Read a model reply. Anything that is not the expected shape degrades to a
 * plain reply with no changes; unknown ids are dropped, an id that is both
 * added and removed is ignored, and repeats collapse.
 */
export function parseChange(
  raw: string,
  recipes: readonly Pick<Recipe, 'id'>[],
  cookbooks: readonly { id: string }[] = [],
): AssistantChange {
  const known = new Set(recipes.map((recipe) => recipe.id));
  const plain = (): AssistantChange => ({
    reply: raw.trim(),
    add: [],
    remove: [],
    cookbook: null,
    settings: {},
  });
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return plain();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return plain();
  }
  const object = value as Record<string, unknown>;
  const pick = (field: unknown): string[] =>
    Array.isArray(field)
      ? [
          ...new Set(
            field.filter(
              (id): id is string => typeof id === 'string' && known.has(id),
            ),
          ),
        ]
      : [];
  const add = pick(object.add);
  const remove = pick(object.remove);
  const both = new Set(add.filter((id) => remove.includes(id)));
  return {
    reply: typeof object.reply === 'string' ? object.reply.trim() : '',
    add: add.filter((id) => !both.has(id)),
    remove: remove.filter((id) => !both.has(id)),
    cookbook:
      typeof object.cookbook === 'string' &&
      cookbooks.some((c) => c.id === object.cookbook)
        ? object.cookbook
        : null,
    settings: parseSettings(object.settings),
  };
}

/** Apply a change through the store and report what really changed. */
export function applyChange(
  store: RecipeStore,
  change: Pick<AssistantChange, 'add' | 'remove'>,
): AppliedChange {
  const before = new Set(store.ids);
  if (change.add.length) store.add(...change.add);
  if (change.remove.length) store.remove(...change.remove);
  const after = new Set(store.ids);
  return {
    added: [...after].filter((id) => !before.has(id)),
    removed: [...before].filter((id) => !after.has(id)),
    kept: change.remove.filter((id) => after.has(id) && before.has(id)),
  };
}

/** A sentence for the chat saying what changed, by recipe label. */
export function describeChange(
  applied: AppliedChange,
  recipes: readonly Pick<Recipe, 'id' | 'label'>[],
): string {
  const label = (id: string) =>
    recipes.find((recipe) => recipe.id === id)?.label ?? id;
  const names = (ids: string[]) => ids.map(label).join(', ');
  const parts: string[] = [];
  if (applied.added.length) parts.push(`Added ${names(applied.added)}.`);
  if (applied.removed.length) parts.push(`Removed ${names(applied.removed)}.`);
  if (applied.kept.length) {
    parts.push(`Kept ${names(applied.kept)} (needed).`);
  }
  return parts.join(' ');
}

/**
 * Write the settings that really change (they are reversible, so no click)
 * and say so tersely, e.g. "Currency CAD, tax 13%." Returns '' when nothing
 * changed.
 */
export function applySettings(
  store: SettingsStore,
  patch: SettingsPatch,
): string {
  const before = store.read();
  const next: AppSettings = { ...before };
  const parts: string[] = [];
  if (patch.currency && patch.currency !== before.currency) {
    next.currency = patch.currency;
    parts.push(`currency ${patch.currency}`);
  }
  if (patch.taxRate !== undefined) {
    const fraction = Number((patch.taxRate / 100).toFixed(6));
    if (fraction !== before.taxRate) {
      next.taxRate = fraction;
      parts.push(`tax ${formatTaxPercent(fraction)}`);
    }
  }
  if (patch.paymentTerms && patch.paymentTerms !== before.paymentTerms) {
    next.paymentTerms = patch.paymentTerms;
    parts.push(`terms ${patch.paymentTerms}`);
  }
  if (!parts.length) return '';
  store.write(next);
  const text = parts.join(', ');
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}
