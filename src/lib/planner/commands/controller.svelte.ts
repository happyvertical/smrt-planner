import { untrack } from 'svelte';
import type {
  RecipeStore,
  SettingsStore,
  ThemeStore,
} from '../../assistant/change.ts';
import { getModelByQualifiedName } from '../../catalog/index.ts';
import {
  type CookbookStore,
  cookbookStore,
} from '../../cookbook/store.svelte.ts';
import { parseCookbook } from '../../cookbook/validate.ts';
import { applyLibraryCookbook } from '../../library/apply.ts';
import { libraryState } from '../../library/state.svelte.ts';
import { resolveFields } from '../../recipes/policy.ts';
import { recipeState } from '../../recipes/state.svelte.ts';
import { settingsOfCookbook } from '../../settings/app-settings.ts';
import type { PlannerHost, PlanSlice } from './host.ts';
import {
  type Cell,
  createCommandRunner,
  type PlannerController,
  type PlannerControllerOptions,
} from './runner.ts';
import type { PlannerTabId } from './types.ts';

export type {
  PlannerController,
  PlannerControllerOptions,
  PlannerNavigation,
} from './runner.ts';

/** A reactive cell: reading it in an effect subscribes to it. */
function reactiveCell<T>(initial: T): Cell<T> {
  let value = $state(initial);
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
}

/**
 * The controller over any host: the shared command runner with reactive cells
 * and an effect that tells subscribers about manual edits. The app's own is
 * `createPlannerController`; this is the seam for hosts made of slices (the
 * assistant's, tests).
 */
export function createControllerForHost(
  host: PlannerHost,
  options: PlannerControllerOptions = {},
): PlannerController {
  let stopEffects: (() => void) | undefined;
  const runner = createCommandRunner(host, options, {
    undoIds: reactiveCell<string[]>([]),
    section: reactiveCell<string | null>(null),
    tab: reactiveCell<PlannerTabId | null>(null),
    plain: (value) => $state.snapshot(value) as typeof value,
    watch: {
      start() {
        if (stopEffects) return;
        stopEffects = $effect.root(() => {
          $effect(() => {
            // Reading the snapshot subscribes to every store it is built from.
            runner.observe();
            untrack(runner.deliver);
          });
        });
      },
      stop() {
        stopEffects?.();
        stopEffects = undefined;
      },
    },
  });
  return runner;
}

/** The slices of the app the assistant already worked with, as a host. */
export function hostFromSlices(slices: {
  store: RecipeStore;
  settings?: SettingsStore;
  theme?: ThemeStore;
}): PlannerHost {
  return {
    recipes: slices.store,
    settings: slices.settings,
    theme: slices.theme,
  };
}

/** The controller over just a recipe store and, optionally, settings and theme. */
export function createSliceController(slices: {
  store: RecipeStore;
  settings?: SettingsStore;
  theme?: ThemeStore;
}): PlannerController {
  return createControllerForHost(hostFromSlices(slices));
}

/** The whole planner app as a host: recipes, options, layout, theme and cookbook. */
export function hostFromStore(
  store: CookbookStore,
  options: Pick<PlannerControllerOptions, 'onReplaced'> = {},
): PlannerHost {
  const plan = (): PlanSlice => {
    const { recipes, features, policies, exposure } = store.snapshot();
    return { recipes, features, policies, ...(exposure ? { exposure } : {}) };
  };
  return {
    recipes: recipeState,
    features: {
      read: () => recipeState.features,
      add: (id) => recipeState.addFeature(id),
      remove: (id) => recipeState.removeFeature(id),
    },
    unavailable: () => [
      ...recipeState.unavailableRecipes,
      ...recipeState.unavailableFeatures,
    ],
    settings: {
      read: () => store.settings(),
      write: (settings) => store.setSettings(settings),
    },
    theme: {
      read: () => store.snapshot().theme,
      write: (theme) => store.setTheme(theme),
    },
    layout: {
      read: () => store.layout,
      write: (layout) => {
        store.layout = layout;
      },
    },
    policies: {
      read: () => store.snapshot().policies,
      write: (rows) => {
        recipeState.rows = rows.map((row) => ({ ...row }));
      },
      locked: (model, field) => {
        const entry = getModelByQualifiedName(model)?.model;
        if (!entry) return false;
        return Boolean(
          resolveFields(
            entry,
            recipeState.hintsFor(model),
            recipeState.rows,
          ).find((resolved) => resolved.field.name === field)?.locked,
        );
      },
    },
    plan: {
      read: plan,
      write: (next) => {
        store.apply({ ...store.snapshot(), ...next });
      },
    },
    cookbook: {
      snapshot: () => store.snapshot(),
      parse: (input) => parseCookbook(input),
      replace: (cookbook) => {
        store.replace(cookbook);
      },
      applyLibrary: (cookbook) => {
        const result = applyLibraryCookbook(
          cookbook,
          store,
          settingsOfCookbook(cookbook.settings),
        );
        if (!result.ok) return result.error;
        libraryState.select(cookbook.id);
        // Sample records are regenerated from the cookbook's own sample data.
        options.onReplaced?.();
        return null;
      },
      applied: () => libraryState.active,
    },
  };
}

/**
 * The controller for the planner app over `store` (the app's is
 * `cookbookStore`). Every UI path that changes the app is a command here, and
 * the assistant, a host page and the MCP and CLI servers use the same ones.
 */
export function createPlannerController(
  store: CookbookStore = cookbookStore,
  options: PlannerControllerOptions = {},
): PlannerController {
  return createControllerForHost(hostFromStore(store, options), options);
}
