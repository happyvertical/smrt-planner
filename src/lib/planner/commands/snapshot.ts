import { resolveShellNavModel } from '@happyvertical/smrt-svelte/workspace/layout';
import { getModelByQualifiedName } from '../../catalog/index.ts';
import { DEFAULT_EXPORT_NAME } from '../../cookbook/file.ts';
import { getLibraryCookbook } from '../../library/index.ts';
import { cookbookNavGroups } from '../../library/menu.ts';
import { recipesById } from '../../recipes/index.ts';
import { DEFAULT_SETTINGS } from '../../settings/app-settings.ts';
import { DEFAULT_COLOR_SCHEME, describeTheme } from '../../theme/theme.ts';
import type { PlannerHost } from './host.ts';
import {
  PLANNER_COMMANDS_VERSION,
  type PlannerTabId,
  type PlanSnapshot,
} from './types.ts';

/** What the controller adds to a snapshot: it owns these, not the host. */
export interface SnapshotExtras {
  revision: number;
  focus: { tab: PlannerTabId | null; section: string | null };
  undo: string[];
}

/** Round a percent to at most 4 places so 0.0825 reads as 8.25, not 8.25000001. */
const percent = (fraction: number) => Number((fraction * 100).toFixed(4));

/**
 * The compact, read-only plan: names and flags, no field lists, so it fits a
 * model prompt (see the size test). Built from the host on demand.
 */
export function buildSnapshot(
  host: PlannerHost,
  extras: SnapshotExtras,
): PlanSnapshot {
  const recipeIds = [...host.recipes.ids];
  const features = [...(host.features?.read() ?? [])].sort();
  const settings = host.settings?.read() ?? DEFAULT_SETTINGS;
  const theme = host.theme?.read();
  const layout = host.layout?.read();
  const applied = host.cookbook?.applied() ?? null;
  const library = applied ? getLibraryCookbook(applied) : undefined;
  const sections = resolveShellNavModel(
    [],
    cookbookNavGroups({ recipes: recipeIds, features }),
    layout,
  )
    .filter((section) => section.group !== null)
    .map((section) => ({
      id: section.id,
      label: section.heading ?? section.defaultHeading ?? section.id,
      hidden: section.hidden,
      items: section.items.map((item) => ({
        id: item.id,
        label: item.label,
        hidden: item.hidden,
      })),
    }));
  return {
    version: PLANNER_COMMANDS_VERSION,
    revision: extras.revision,
    app: {
      name: library?.name ?? DEFAULT_EXPORT_NAME,
      cookbook: library?.id ?? null,
    },
    recipes: recipeIds
      .filter((id) => recipesById.has(id))
      .map((id) => ({ id, label: recipesById.get(id)?.label ?? id })),
    features: features.filter((id) => getModelByQualifiedName(id)),
    unavailable: [...(host.unavailable?.() ?? [])],
    settings: {
      currency: settings.currency,
      taxRate: percent(settings.taxRate),
      paymentTerms: settings.paymentTerms,
    },
    theme: {
      text: describeTheme(theme),
      preset: theme?.preset ?? null,
      primary: theme?.custom?.primary ?? null,
      colorScheme: theme?.colorScheme ?? DEFAULT_COLOR_SCHEME,
    },
    sections,
    focus: extras.focus,
    policies:
      host.plan?.read().policies.length ?? host.policies?.read().length ?? 0,
    undo: extras.undo,
  };
}
