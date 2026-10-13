/**
 * The planner's catalog models as the generated record screens take them
 * (`@happyvertical/smrt-svelte/screens`, smrt#3718): a
 * `ScreenCollectionDefinition` is the browser-safe collection definition a
 * SMRT build emits, and the planner has the same facts in `catalog.json`. The
 * applied recipe options (which fields a view shows, their labels and help)
 * travel as the `ScreenPolicy`, so a field renders only when the policy lists
 * it, as on a generated screen.
 */
import type {
  ScreenCollectionDefinition,
  ScreenFieldDefinition,
  ScreenFieldType,
  ScreenPolicy,
  ScreenRelationshipDefinition,
} from '@happyvertical/smrt-svelte/screens';
import { getModelByQualifiedName } from '../catalog/index.ts';
import type { CatalogField, CatalogModel } from '../catalog/types.ts';
import type { ViewField } from '../recipes/policy.ts';

const FIELD_TYPES: readonly ScreenFieldType[] = [
  'text',
  'integer',
  'decimal',
  'boolean',
  'datetime',
  'json',
  'foreignKey',
  'crossPackageRef',
];

function fieldType(type: string): ScreenFieldType {
  return (FIELD_TYPES as readonly string[]).includes(type)
    ? (type as ScreenFieldType)
    : 'text';
}

function fieldDefinition(field: CatalogField): ScreenFieldDefinition {
  const ui = field.ui ? { ...field.ui } : undefined;
  return {
    type: fieldType(field.type),
    required: field.required,
    nullable: !field.required,
    ...(field.default !== undefined ? { default: field.default } : {}),
    ...(field.description ? { description: field.description } : {}),
    ...(ui ? { ui } : {}),
  };
}

/** A field's `related` as a qualified name, given the model it is declared on. */
function qualify(related: string, ownerId: string): string {
  return related.includes(':')
    ? related
    : `${ownerId.slice(0, ownerId.lastIndexOf(':'))}:${related}`;
}

/** The model's reference fields as the definition's relationship edges. */
function relationships(model: CatalogModel): ScreenRelationshipDefinition[] {
  return model.fields.flatMap((field) => {
    if (
      (field.type !== 'foreignKey' && field.type !== 'crossPackageRef') ||
      !field.related
    ) {
      return [];
    }
    const target = getModelByQualifiedName(qualify(field.related, model.id));
    return target
      ? [
          {
            field: field.name,
            kind:
              field.type === 'crossPackageRef'
                ? 'crossPackageRef'
                : 'foreignKey',
            relatedCollection: target.model.collection,
          },
        ]
      : [];
  });
}

/**
 * The model's own fields (and reference edges) as a screen collection
 * definition, keyed by its collection name like a generated one.
 */
export function screenDefinition(
  model: CatalogModel,
): ScreenCollectionDefinition {
  const edges = relationships(model);
  return {
    name: model.collection,
    objectRef: model.id,
    className: model.name,
    idField: 'id',
    fields: Object.fromEntries(
      model.fields.map((field) => [field.name, fieldDefinition(field)]),
    ),
    ...(edges.length ? { relationships: edges } : {}),
  };
}

/**
 * The fields a view shows, with the recipe options' labels and help, as the
 * screens' resolved policy: everything listed is `basic`, in list order, and
 * a field the applied options hide is simply not in it.
 */
export function screenPolicy(
  model: CatalogModel,
  fields: readonly ViewField[],
): ScreenPolicy {
  return {
    objectRef: model.id,
    fields: Object.fromEntries(
      fields.map((field, order) => [
        field.name,
        {
          visibility: 'basic' as const,
          label: field.label,
          help: field.help ?? null,
          order,
          required: field.required,
        },
      ]),
    ),
  };
}
