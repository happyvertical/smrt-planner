import type { Cookbook } from '../cookbooks/types.ts';
import type { Recipe } from '../recipes/types.ts';
import type { AppSettings } from '../settings/app-settings.ts';

/** The slice of a cookbook the model needs to pick one. */
export type CookbookBrief = Pick<Cookbook, 'id' | 'name' | 'summary'>;

/** Tax is shown as a percent, the unit the person says it in. */
export function formatTaxPercent(fraction: number): string {
  return `${Number((fraction * 100).toFixed(4))}%`;
}

/**
 * The system prompt: what the assistant is, how little to say, the recipes it
 * may use (id, label, summary, synonyms), the cookbooks it may offer, the
 * current settings and which recipes are on now. Short on purpose, for a 1-2B
 * model.
 */
export function buildSystemPrompt(
  recipes: readonly Recipe[],
  current: readonly string[],
  cookbooks: readonly CookbookBrief[] = [],
  settings?: AppSettings,
): string {
  const lines = recipes.map((recipe) => {
    const also = recipe.synonyms.length
      ? ` Also called: ${recipe.synonyms.join(', ')}.`
      : '';
    return `- ${recipe.id}: ${recipe.label}. ${recipe.summary}${also}`;
  });
  const out = [
    'You help assemble a small business app. Reply as JSON.',
    '"reply": answer what they just said in one sentence of 12 words or fewer. No greeting; never repeat a reply.',
    '"add"/"remove": recipe ids, only what they ask to add or drop; else []. Dependencies are automatic.',
  ];
  if (cookbooks.length) {
    out.push('"cookbook": id only if their business clearly fits, else null.');
  }
  if (settings) {
    out.push(
      '"settings": only what they state: currency (ISO), taxRate (percent), paymentTerms; else omit, and do not mention them otherwise.',
    );
  }
  out.push('', 'Recipes:', ...lines);
  if (cookbooks.length) {
    out.push(
      '',
      'Cookbooks:',
      ...cookbooks.map((c) => `- ${c.id}: ${c.name}. ${c.summary}`),
    );
  }
  out.push(
    '',
    `Currently on: ${current.length ? current.join(', ') : 'none'}.`,
  );
  if (settings) {
    const terms = settings.paymentTerms
      ? `, terms ${settings.paymentTerms}`
      : '';
    out.push(
      `Settings: currency ${settings.currency}, tax ${formatTaxPercent(settings.taxRate)}${terms}.`,
    );
  }
  return out.join('\n');
}
