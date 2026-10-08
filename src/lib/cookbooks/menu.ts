import type { ShellNavGroup } from '@happyvertical/smrt-svelte/workspace';
import { applyShellLayout } from '@happyvertical/smrt-svelte/workspace/layout';
import type { Blueprint } from '../blueprint/types.ts';
import { FEATURE_SECTION, featureNavItems } from '../recipes/features.ts';
import { buildNavSections, recipeNav, recipesById } from '../recipes/index.ts';
import { recipeNavItemId } from '../recipes/sections.ts';
import type { CookbookLayout, MenuSection } from './types.ts';

/**
 * The navigation a blueprint produces before its layout: one group per nav
 * section, items in recipe order, with the same stable ids the app shell uses
 * (`recipeNavItemId`), so a layout's ids line up with what the app generates.
 */
export function blueprintNavGroups(
  blueprint: Pick<Blueprint, 'recipes' | 'features'>,
): ShellNavGroup[] {
  const added = blueprint.recipes.flatMap((id) => {
    const recipe = recipesById.get(id);
    return recipe ? [recipe] : [];
  });
  const groups: ShellNavGroup[] = buildNavSections(added).map((section) => {
    const seen = new Set<string>();
    const items: ShellNavGroup['items'] = [];
    for (const recipe of section.recipes) {
      for (const entry of recipeNav(recipe)) {
        const dedupe = `${entry.model.id}:${entry.label}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        items.push({
          id: recipeNavItemId(
            section.id,
            entry.packageId,
            entry.model.name,
            entry.label,
          ),
          href: '#',
          label: entry.label,
        });
      }
    }
    return { id: `section:${section.id}`, heading: section.label, items };
  });
  const features = featureNavItems(blueprint.features).map((item) => ({
    id: item.id,
    href: '#',
    label: item.label,
  }));
  if (features.length) {
    groups.push({
      id: `section:${FEATURE_SECTION.id}`,
      heading: FEATURE_SECTION.label,
      items: features,
    });
  }
  return groups;
}

/**
 * The menu a blueprint gives its app, in the visitor's own words: sections and
 * entries after the layout is applied (moves, hides, renames), with each
 * entry's `layout.items` label. Pure, so the Cookbooks preview shows exactly
 * what applying the cookbook will build.
 */
export function previewMenu(
  blueprint: Pick<Blueprint, 'recipes' | 'features'> & {
    layout?: CookbookLayout;
  },
): MenuSection[] {
  const layout = blueprint.layout;
  const applied = applyShellLayout(
    [],
    blueprintNavGroups(blueprint),
    undefined,
    layout,
  );
  return applied.groups.map((group) => ({
    id: group.id ?? String(group.heading),
    label: group.heading ?? '',
    entries: group.items.map((item) => ({
      id: item.id ?? item.href,
      label: layout?.items?.[item.id ?? item.href]?.label?.trim() || item.label,
    })),
  }));
}
