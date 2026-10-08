import { recipesById } from '../recipes/index.ts';
import raw from './cookbooks.json';
import type { Cookbook, CookbookFile } from './types.ts';

export { COOKBOOK_ICONS } from './icons.ts';
export type * from './types.ts';

/** The curated cookbooks, in the order the tab shows them. */
export const cookbooks: readonly Cookbook[] = (raw as unknown as CookbookFile)
  .cookbooks;

export function getCookbook(id: string): Cookbook | undefined {
  return cookbooks.find((cookbook) => cookbook.id === id);
}

/** Recipe labels for the preview's chips, in the blueprint's (sorted) order. */
export function cookbookRecipeLabels(cookbook: Cookbook): string[] {
  return cookbook.blueprint.recipes.map(
    (id) => recipesById.get(id)?.label ?? id,
  );
}
