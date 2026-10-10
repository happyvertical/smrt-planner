import type { OverviewOverride } from '@happyvertical/smrt-svelte/overview/server';
import type { ShellLayout } from '@happyvertical/smrt-svelte/workspace/layout';
import { getModelByQualifiedName } from '../../catalog/index.ts';
import { assembleCookbook } from '../../cookbook/assemble.ts';
import { parseCookbookWith } from '../../cookbook/parse.ts';
import type { Cookbook } from '../../cookbook/types.ts';
import { resolveLibraryCookbook } from '../../library/document.ts';
import {
  emptyPlanData,
  hintsForModel,
  type PlanData,
  planFields,
  planFromCookbook,
  withFeatureAdded,
  withFeatureRemoved,
  withRecipesAdded,
  withRecipesRemoved,
} from '../../recipes/plan-data.ts';
import { resolveFields } from '../../recipes/policy.ts';
import {
  readSettings,
  settingsOfCookbook,
  writeSettings,
} from '../../settings/app-settings.ts';
import { compactTheme, type ThemeSetting } from '../../theme/theme.ts';
import type { PlannerHost } from './host.ts';

/**
 * A planner host over plain objects: no runes, no module singletons, no
 * browser. Each call makes an independent plan, so a server can hold many.
 * It is the same glue `hostFromStore` is for the browser's stores; the rules
 * both call (`plan-data.ts`, `assembleCookbook`, `resolveLibraryCookbook`)
 * are shared.
 */
/** A plain host always holds the whole document. */
export type PlainHost = PlannerHost & Required<Pick<PlannerHost, 'cookbook'>>;

export function createPlainHost(initial?: Cookbook): PlainHost {
  let plan: PlanData = initial ? planFromCookbook(initial) : emptyPlanData();
  let layout: ShellLayout | undefined = initial?.layout;
  let theme: ThemeSetting | undefined = initial?.theme;
  let overviews: Record<string, OverviewOverride> = {
    ...(initial?.overviews ?? {}),
  };
  /** The library cookbook the plan was last set up from, if any. */
  let applied: string | null = null;

  const snapshot = (): Cookbook =>
    assembleCookbook(plan, { layout, theme, overviews });

  /** The strict import check, with no page-customisation registry (Node). */
  const parse = (input: unknown) => parseCookbookWith(input);

  /** Replace everything from a validated cookbook. */
  const replace = (cookbook: Cookbook): void => {
    plan = planFromCookbook(cookbook);
    layout = cookbook.layout;
    theme = cookbook.theme;
    overviews = { ...(cookbook.overviews ?? {}) };
  };

  return {
    recipes: {
      get ids() {
        return plan.ids;
      },
      add: (...ids) => {
        plan = withRecipesAdded(plan, ids);
      },
      remove: (...ids) => {
        plan = withRecipesRemoved(plan, ids);
      },
    },
    features: {
      read: () => plan.features,
      add: (id) => {
        plan = withFeatureAdded(plan, id);
      },
      remove: (id) => {
        plan = withFeatureRemoved(plan, id);
      },
    },
    unavailable: () => [
      ...plan.unavailableRecipes,
      ...plan.unavailableFeatures,
    ],
    settings: {
      read: () => readSettings(snapshot()),
      write: (settings) => {
        plan = {
          ...plan,
          rows: writeSettings(snapshot(), settings).policies.map((row) => ({
            ...row,
          })),
        };
      },
    },
    theme: {
      read: () => theme,
      write: (next) => {
        theme = compactTheme(next);
      },
    },
    layout: {
      read: () => layout,
      write: (next) => {
        layout = next;
      },
    },
    policies: {
      read: () => plan.rows,
      write: (rows) => {
        plan = { ...plan, rows: rows.map((row) => ({ ...row })) };
      },
      locked: (model, field) => {
        const entry = getModelByQualifiedName(model)?.model;
        if (!entry) return false;
        return Boolean(
          resolveFields(entry, hintsForModel(plan, model), plan.rows).find(
            (resolved) => resolved.field.name === field,
          )?.locked,
        );
      },
    },
    plan: {
      read: () => planFields(plan),
      write: (next) => {
        plan = planFromCookbook(next);
      },
    },
    cookbook: {
      snapshot,
      parse,
      replace,
      applyLibrary: (cookbook) => {
        const result = resolveLibraryCookbook(
          cookbook,
          parse,
          settingsOfCookbook(cookbook.settings),
        );
        if (!result.ok) return result.error;
        // A cookbook without a theme leaves the plan's own look alone.
        const keep = result.cookbook.theme ? undefined : theme;
        replace(result.cookbook);
        if (keep) theme = keep;
        applied = cookbook.id;
        return null;
      },
      applied: () => applied,
    },
  };
}
