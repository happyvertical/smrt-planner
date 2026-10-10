import {
  hideShellEntry,
  isShellLayoutEmpty,
  renameShellItem,
  renameShellSection,
  resolveShellNavModel,
  type ShellLayout,
  showShellEntry,
} from '@happyvertical/smrt-svelte/workspace/layout';
import {
  applyChange,
  applySettings,
  applyThemePatch,
  describeChange,
  parseSettings,
  parseThemePatch,
} from '../../assistant/change.ts';
import { getModelByQualifiedName } from '../../catalog/index.ts';
import {
  DEFAULT_EXPORT_NAME,
  exportFileName,
  serializeCookbook,
} from '../../cookbook/file.ts';
import { parseCookbook } from '../../cookbook/validate.ts';
import { humanize } from '../../data/format.ts';
import { isCookbookEmpty } from '../../library/apply.ts';
import { getLibraryCookbook } from '../../library/index.ts';
import { cookbookNavGroups } from '../../library/menu.ts';
import { recipes, recipesById } from '../../recipes/index.ts';
import type { FieldPolicyRow } from '../../recipes/policy.ts';
import type { PlannerHost } from './host.ts';
import type {
  CommandError,
  CommandErrorCode,
  CommandInputs,
  CommandName,
  ExportData,
  RecipeChanges,
} from './types.ts';

/** What running one command produced, before the controller adds the snapshot. */
export type Outcome =
  | {
      ok: true;
      summary: string;
      changes?: RecipeChanges;
      data?: unknown;
    }
  | { ok: false; error: CommandError };

const fail = (code: CommandErrorCode, message: string): Outcome => ({
  ok: false,
  error: { code, message },
});

const done = (
  summary: string,
  extra: { changes?: RecipeChanges; data?: unknown } = {},
): Outcome => ({ ok: true, summary, ...extra });

const unsupported = (what: string) =>
  fail('unsupported', `This planner has no ${what}, so it cannot do that.`);

const REPLACE_NEEDED =
  'This replaces the recipes, options, menu and look. Send replace: true to confirm.';

const modelLabel = (id: string) =>
  humanize(getModelByQualifiedName(id)?.model.name ?? id);

const list = (values: readonly string[]) => values.join(', ');

function setFeatures(
  host: PlannerHost,
  ids: readonly string[],
  on: boolean,
): RecipeChanges {
  const features = host.features;
  if (!features) return { added: [], removed: [], kept: [] };
  const before = new Set(features.read());
  for (const id of ids) {
    if (on) features.add(id);
    else features.remove(id);
  }
  const after = new Set(features.read());
  return {
    added: [...after].filter((id) => !before.has(id)),
    removed: [...before].filter((id) => !after.has(id)),
    kept: [],
  };
}

const describeFeatures = (changes: RecipeChanges) =>
  [
    changes.added.length ? `Added ${list(changes.added.map(modelLabel))}.` : '',
    changes.removed.length
      ? `Removed ${list(changes.removed.map(modelLabel))}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

const unknownModels = (ids: readonly string[]): string[] =>
  ids.filter((id) => !getModelByQualifiedName(id)?.model.exposed);

function mergeChanges(a: RecipeChanges, b: RecipeChanges): RecipeChanges {
  return {
    added: [...a.added, ...b.added],
    removed: [...a.removed, ...b.removed],
    kept: [...a.kept, ...b.kept],
  };
}

type Handler<N extends CommandName> = (
  host: PlannerHost,
  input: CommandInputs[N],
) => Outcome;

/** The menu the cookbook generates, with the layout applied: ids to check against. */
function navigation(host: PlannerHost) {
  const layout = host.layout?.read();
  const groups = cookbookNavGroups({
    recipes: [...host.recipes.ids],
    features: [...(host.features?.read() ?? [])],
  });
  const model = resolveShellNavModel([], groups, layout).filter(
    (section) => section.group !== null,
  );
  const sectionIds = new Set(model.map((section) => section.id));
  const itemIds = new Set(
    model.flatMap((section) => section.items.map((item) => item.id)),
  );
  return { layout, groups, model, sectionIds, itemIds };
}

/** Write a layout, or clear it when the edit left it empty. */
function writeLayout(host: PlannerHost, next: ShellLayout): void {
  host.layout?.write(isShellLayoutEmpty(next) ? undefined : next);
}

/** Does the whole app hold nothing yet (so replacing it needs no say-so)? */
const isEmpty = (host: PlannerHost): boolean =>
  !host.cookbook || isCookbookEmpty(host.cookbook.snapshot());

/** Apply a layout edit when it changes the layout; '' (a no-op) when it does not. */
function layoutEdit(
  host: PlannerHost,
  next: ShellLayout,
  current: ShellLayout | undefined,
  summary: string,
): Outcome {
  if (JSON.stringify(next) === JSON.stringify(current ?? null)) return done('');
  writeLayout(host, next);
  return done(summary);
}

/** A parsed patch must keep every key given: a dropped value is an error, not a no-op. */
function firstDropped(
  input: object,
  patch: Record<string, unknown>,
): string | undefined {
  return Object.keys(input).find((key) => patch[key] === undefined);
}

const handlers: { [N in CommandName]?: Handler<N> } = {
  add_recipes(host, { ids }) {
    const applied = applyChange(host.recipes, { add: ids, remove: [] });
    return done(describeChange(applied, recipes), { changes: applied });
  },
  remove_recipes(host, { ids }) {
    const applied = applyChange(host.recipes, { add: [], remove: ids });
    return done(describeChange(applied, recipes), { changes: applied });
  },
  add_features(host, { ids }) {
    if (!host.features) return unsupported('single-model features');
    const missing = unknownModels(ids);
    if (missing.length) {
      return fail('not_found', `No such model to add: ${list(missing)}.`);
    }
    const changes = setFeatures(host, ids, true);
    return done(describeFeatures(changes), { changes });
  },
  remove_features(host, { ids }) {
    if (!host.features) return unsupported('single-model features');
    const changes = setFeatures(host, ids, false);
    return done(describeFeatures(changes), { changes });
  },
  add_cookbook(host, { id }) {
    const cookbook = getLibraryCookbook(id);
    if (!cookbook) return fail('not_found', `No cookbook "${id}".`);
    const recipeChanges = applyChange(host.recipes, {
      add: cookbook.document.recipes,
      remove: [],
    });
    const featureChanges = setFeatures(host, cookbook.document.features, true);
    const changes = mergeChanges(recipeChanges, featureChanges);
    return done(
      changes.added.length ? `Added the ${cookbook.name} cookbook.` : '',
      {
        changes,
      },
    );
  },
  remove_cookbook(host, { id }) {
    const cookbook = getLibraryCookbook(id);
    if (!cookbook) return fail('not_found', `No cookbook "${id}".`);
    const recipeChanges = applyChange(host.recipes, {
      add: [],
      remove: cookbook.document.recipes,
    });
    const featureChanges = setFeatures(host, cookbook.document.features, false);
    const summary = [
      describeChange(recipeChanges, recipes),
      describeFeatures(featureChanges),
    ]
      .filter(Boolean)
      .join(' ');
    return done(summary, {
      changes: mergeChanges(recipeChanges, featureChanges),
    });
  },
  apply_cookbook(host, { id, replace }) {
    if (!host.cookbook) return unsupported('whole-app cookbook');
    const cookbook = getLibraryCookbook(id);
    if (!cookbook) return fail('not_found', `No cookbook "${id}".`);
    if (!replace && !isEmpty(host)) {
      return fail('confirmation_required', REPLACE_NEEDED);
    }
    const error = host.cookbook.applyLibrary(cookbook);
    if (error) return fail('failed', error);
    return done(`${cookbook.name} set up.`);
  },
  import_cookbook(host, { document, replace }) {
    if (!host.cookbook) return unsupported('whole-app cookbook');
    const result = parseCookbook(document);
    if (!result.ok) return fail('invalid_input', result.error);
    if (!replace && !isEmpty(host)) {
      return fail('confirmation_required', REPLACE_NEEDED);
    }
    host.cookbook.replace(result.cookbook);
    const n = result.cookbook.recipes.length;
    const dropped = result.dropped?.length
      ? ` Not imported: ${result.dropped.join(' ')}`
      : '';
    return done(`Imported ${n} ${n === 1 ? 'recipe' : 'recipes'}.${dropped}`);
  },
  set_settings(host, input) {
    if (!host.settings) return unsupported('app settings');
    const patch = parseSettings(input);
    const dropped = firstDropped(input, patch as Record<string, unknown>);
    if (dropped) {
      return fail('invalid_input', `${dropped} is not an acceptable value.`);
    }
    return done(applySettings(host.settings, patch));
  },
  set_policy(host, input) {
    const policies = host.policies;
    if (!policies) return unsupported('field options');
    const model = getModelByQualifiedName(input.model)?.model;
    if (!model) return fail('not_found', `No such model: ${input.model}.`);
    const field = model.fields.find((f) => f.name === input.field);
    if (!field || field.system) {
      return fail('not_found', `${model.name} has no field ${input.field}.`);
    }
    const covered = new Set([
      ...[...host.recipes.ids].flatMap(
        (id) => recipesById.get(id)?.models ?? [],
      ),
      ...(host.features?.read() ?? []),
    ]);
    if (!covered.has(model.id)) {
      return fail(
        'not_found',
        `${humanize(model.name)} is not in the app yet; add its recipe or feature first.`,
      );
    }
    if (policies.locked(model.id, field.name)) {
      return fail('failed', `${input.field} is locked by its recipe.`);
    }
    const rows = policies.read().map((row) => ({ ...row }));
    const existing = rows.find(
      (r) => r.objectRef === model.id && r.fieldName === field.name,
    );
    const row: FieldPolicyRow = existing ?? {
      objectRef: model.id,
      fieldName: field.name,
      scopeType: 'app',
    };
    const before = JSON.stringify(row);
    for (const key of ['visibility', 'label', 'help'] as const) {
      const value = input[key];
      if (value === undefined) continue;
      if (value === null) delete row[key];
      else (row as unknown as Record<string, unknown>)[key] = value;
    }
    if (input.defaultValue !== undefined) {
      if (input.defaultValue === null) {
        delete row.defaultValue;
      } else {
        const encoded = JSON.stringify(input.defaultValue);
        if (encoded === undefined) {
          return fail('invalid_input', 'defaultValue is not a JSON value.');
        }
        row.defaultValue = encoded;
      }
    }
    // A row with only its identity says nothing: it is removed, not stored.
    const empty = Object.keys(row).length <= 3;
    if (JSON.stringify(row) === before || (empty && !existing)) return done('');
    const rest = rows.filter((r) => r !== existing);
    policies.write(empty ? rest : [...rest, row]);
    return done(`Updated ${humanize(model.name)} ${field.name}.`);
  },
  set_theme(host, input) {
    if (!host.theme) return unsupported('theme');
    const patch = parseThemePatch(input);
    const dropped = firstDropped(input, patch as Record<string, unknown>);
    if (dropped) {
      return fail('invalid_input', `${dropped} is not an acceptable value.`);
    }
    return done(applyThemePatch(host.theme, patch)?.text ?? '');
  },
  reset_theme(host) {
    if (!host.theme) return unsupported('theme');
    if (host.theme.read() === undefined) return done('');
    host.theme.write(undefined);
    return done('Theme: default.');
  },
  rename_section(host, { id, label }) {
    if (!host.layout) return unsupported('menu layout');
    const nav = navigation(host);
    if (!nav.sectionIds.has(id)) {
      return fail('not_found', `No menu section "${id}".`);
    }
    const next = renameShellSection([], nav.groups, nav.layout, id, label);
    return layoutEdit(
      host,
      next,
      nav.layout,
      `Renamed the section to ${label.trim()}.`,
    );
  },
  rename_item(host, { id, label }) {
    if (!host.layout) return unsupported('menu layout');
    const nav = navigation(host);
    if (!nav.itemIds.has(id)) {
      return fail('not_found', `No menu entry "${id}".`);
    }
    const next = renameShellItem([], nav.groups, nav.layout, id, label);
    return layoutEdit(
      host,
      next,
      nav.layout,
      label ? `Renamed the entry to ${label.trim()}.` : 'Entry name restored.',
    );
  },
  hide(host, { id }) {
    if (!host.layout) return unsupported('menu layout');
    const nav = navigation(host);
    if (!nav.sectionIds.has(id) && !nav.itemIds.has(id)) {
      return fail('not_found', `No menu section or entry "${id}".`);
    }
    const next = hideShellEntry([], nav.groups, nav.layout, id);
    return layoutEdit(host, next, nav.layout, 'Hidden.');
  },
  show(host, { id }) {
    if (!host.layout) return unsupported('menu layout');
    const nav = navigation(host);
    if (!nav.sectionIds.has(id) && !nav.itemIds.has(id)) {
      return fail('not_found', `No menu section or entry "${id}".`);
    }
    return layoutEdit(
      host,
      showShellEntry(nav.layout, id),
      nav.layout,
      'Shown.',
    );
  },
  export_cookbook(host, { name }) {
    if (!host.cookbook) return unsupported('whole-app cookbook');
    const cookbook = host.cookbook.snapshot();
    const applied = host.cookbook.applied();
    const fileName = exportFileName(
      name ??
        (applied ? getLibraryCookbook(applied)?.name : undefined) ??
        DEFAULT_EXPORT_NAME,
    );
    const data: ExportData = {
      fileName,
      text: serializeCookbook(cookbook),
      cookbook,
    };
    return done('', { data });
  },
};

/** Run one validated command that changes the app (or exports it). */
export function execute<N extends CommandName>(
  host: PlannerHost,
  name: N,
  input: CommandInputs[N],
): Outcome {
  const handler = handlers[name] as Handler<N> | undefined;
  if (!handler) return fail('unknown_command', `No command "${name}".`);
  return handler(host, input);
}
