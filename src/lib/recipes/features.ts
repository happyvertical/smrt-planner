import { exposedModels, getModelByQualifiedName } from '../catalog/index.ts';
import type { Catalog, CatalogPackage } from '../catalog/types.ts';
import { humanize } from '../data/format.ts';
import type { Recipe, RecipeNavSection } from './types.ts';

/**
 * Features: exposed catalog models no recipe covers, which a visitor can add
 * one at a time (the Planner's Features tab). They sit in the blueprint's
 * `features` and in one suggested nav section, after the recipes' sections.
 */
export const FEATURE_SECTION: RecipeNavSection = { id: 'more', label: 'More' };

export interface FeatureEntry {
  /** `@scope/pkg:Class` qualified name, as stored in the blueprint. */
  id: string;
  name: string;
  /** Humanized model name, e.g. `Purchase Order`. */
  label: string;
  /** Catalog package id, for `/m/<package>/<model>/` and `/packages/<id>/`. */
  packageId: string;
  description: string;
  fieldNames: string[];
}

/** One line for a row: the model's description, else how many fields it has. */
function describeModel(model: CatalogPackage['models'][number]): string {
  const description = (model as { description?: string }).description?.trim();
  if (description) return description.split(/(?<=[.!?])\s/)[0] ?? description;
  const count = model.fields.filter((f) => !f.system).length;
  return `${count} ${count === 1 ? 'field' : 'fields'}`;
}

/** Every exposed model that no recipe lists in `models`, by package then name. */
export function featureEntries(
  catalog: Catalog,
  recipes: readonly Recipe[],
): FeatureEntry[] {
  const covered = new Set(recipes.flatMap((recipe) => recipe.models));
  return catalog.packages.flatMap((pkg) =>
    exposedModels(pkg)
      .filter((model) => !covered.has(model.id))
      .map((model) => ({
        id: model.id,
        name: model.name,
        label: humanize(model.name),
        packageId: pkg.id,
        description: describeModel(model),
        fieldNames: model.fields.map((f) => f.name),
      })),
  );
}

/** Packages that have at least one of the entries, in catalog order. */
export function featurePackages(entries: readonly FeatureEntry[]): string[] {
  return [...new Set(entries.map((e) => e.packageId))];
}

/**
 * Entries matching every search term (model name, description, package, field
 * names; case-insensitive) and, when given, one package.
 */
export function filterFeatures(
  entries: readonly FeatureEntry[],
  query: string,
  packageId?: string | null,
): FeatureEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (packageId && entry.packageId !== packageId) return false;
    if (!terms.length) return true;
    const haystack = [
      entry.name,
      entry.label,
      entry.description,
      entry.packageId,
      ...entry.fieldNames,
    ]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export interface FeatureNavItem {
  /** Stable layout id: `section:more:<package>:<Model>`. */
  id: string;
  packageId: string;
  modelName: string;
  label: string;
}

/** Nav items for the added feature models; unknown or internal ones are dropped. */
export function featureNavItems(features: readonly string[]): FeatureNavItem[] {
  return features.flatMap((qualified) => {
    const found = getModelByQualifiedName(qualified);
    if (!found?.model.exposed) return [];
    return [
      {
        id: `section:${FEATURE_SECTION.id}:${found.pkg.id}:${found.model.name}`,
        packageId: found.pkg.id,
        modelName: found.model.name,
        label: humanize(found.model.name),
      },
    ];
  });
}
