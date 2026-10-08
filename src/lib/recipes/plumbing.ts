import type { Catalog, CatalogModel } from '../catalog/types.ts';

/**
 * Plumbing vs feature. The Features tab lists models a visitor can add to the
 * menu; most of the ~220 uncovered models are rows that only make sense inside
 * another model (a line item, a link table, a lookup list), so they are hidden
 * unless "Show all" is on. The rules are data-driven where the catalog allows:
 *
 * 1. Extends a junction/association base (`SmrtJunction`, `SmrtJunctionBase`,
 *    `SmrtPolymorphicAssociation`). The catalog keeps `extends` only for
 *    same-package STI parents, so this fires once the generator carries bases.
 * 2. Looks like a link table: two or more foreign keys and at most one other
 *    own field (`GroupMember`, `RolePermission`, `ProfileMetadata`).
 * 3. Child/extension record, by name suffix: `Metafield`, `Metadata`,
 *    `Association`, `LineItem`, `Allocation`, `Revision`, `Attachment`,
 *    `Snapshot`, `Completion`, `Override`, `Alias`. Each appears in the catalog
 *    only as a dependent of a parent model (`InvoiceLineItem`,
 *    `ContentContributionRevision`, `CampaignMetricSnapshot`).
 * 4. Tiny lookup list: a name ending `Status` or `Type` with at most three
 *    non-system fields (`AssetStatus`, `PlaceType`, `ProfileType`). Richer
 *    types such as `ContentContributionType` stay features.
 */
export const JUNCTION_BASES: readonly string[] = [
  'SmrtJunction',
  'SmrtJunctionBase',
  'SmrtPolymorphicAssociation',
];

export const CHILD_SUFFIXES: readonly string[] = [
  'Metafield',
  'Metadata',
  'Association',
  'LineItem',
  'Allocation',
  'Revision',
  'Attachment',
  'Snapshot',
  'Completion',
  'Override',
  'Alias',
];

export const LOOKUP_SUFFIXES: readonly string[] = ['Status', 'Type'];
export const LOOKUP_MAX_FIELDS = 3;
export const LINK_MIN_REFS = 2;
export const LINK_MAX_OTHER_FIELDS = 1;

type ModelShape = Pick<CatalogModel, 'name' | 'fields' | 'extends'>;

const REF_TYPES = new Set(['foreignKey', 'crossPackageRef']);

/** The reason a model is plumbing, or null when it is a feature. */
export function plumbingReason(model: ModelShape): string | null {
  const base = model.extends?.split(':').pop();
  if (base && JUNCTION_BASES.includes(base)) return 'junction';

  const own = model.fields.filter((f) => !f.system);
  const refs = own.filter((f) => REF_TYPES.has(f.type)).length;
  if (refs >= LINK_MIN_REFS && own.length - refs <= LINK_MAX_OTHER_FIELDS) {
    return 'link';
  }
  if (CHILD_SUFFIXES.some((s) => model.name.endsWith(s))) return 'child';
  if (
    own.length <= LOOKUP_MAX_FIELDS &&
    LOOKUP_SUFFIXES.some((s) => model.name.endsWith(s))
  ) {
    return 'lookup';
  }
  return null;
}

export function isPlumbing(model: ModelShape): boolean {
  return plumbingReason(model) !== null;
}

/** Plumbing reasons that make a model a dependent record of what it points at. */
const CHILD_REASONS = new Set(['junction', 'link', 'child']);

/** A field's `related` as a qualified name, given the package it is declared in. */
function qualify(related: string, ownerId: string): string {
  return related.includes(':')
    ? related
    : `${ownerId.slice(0, ownerId.lastIndexOf(':'))}:${related}`;
}

/**
 * The model and its STI ancestors, nearest first (`ProductionOrder` extends
 * `Contract`, whose `ContractLineItem` rows belong to every Contract subtype).
 */
function lineage(byId: Map<string, CatalogModel>, modelId: string): string[] {
  const ids: string[] = [];
  let current = byId.get(modelId);
  while (current && !ids.includes(current.id)) {
    ids.push(current.id);
    current = current.extends
      ? byId.get(qualify(current.extends, current.id))
      : undefined;
  }
  return ids;
}

/**
 * Child records of a model, found from the catalog: models with a foreign key
 * to the model (or to a model it extends) that are line items, allocations,
 * link tables and the like (`plumbingReason` of junction, link or child, never
 * a plain lookup list). They ride along with the model and have no menu entry.
 */
export function childModels(catalog: Catalog, modelId: string): CatalogModel[] {
  const all = catalog.packages.flatMap((p) => p.models);
  const byId = new Map(all.map((m) => [m.id, m]));
  const parents = new Set(lineage(byId, modelId));
  if (!parents.size) return [];
  return all.filter((candidate) => {
    if (parents.has(candidate.id)) return false;
    const reason = plumbingReason(candidate);
    if (!reason || !CHILD_REASONS.has(reason)) return false;
    return candidate.fields.some(
      (f) =>
        REF_TYPES.has(f.type) &&
        f.related &&
        parents.has(qualify(f.related, candidate.id)),
    );
  });
}
