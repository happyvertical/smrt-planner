import type { Cookbook } from '../../cookbook/types.ts';

/**
 * The planner command set, version 1. A change to a command's input that an
 * older client could not send, or to a result it could not read, bumps this;
 * adding a command or an optional field does not.
 */
export const PLANNER_COMMANDS_VERSION = 1;

/** The planner's tabs, in order. Navigation only; never part of the cookbook. */
export const PLANNER_TAB_IDS = [
  'cookbooks',
  'recipes',
  'features',
  'layout',
  'settings',
  'export',
] as const;
export type PlannerTabId = (typeof PLANNER_TAB_IDS)[number];

/** Input of each command, keyed by the command's (tool) name. */
export interface CommandInputs {
  /** Switch recipes on, with everything they `require`. */
  add_recipes: { ids: string[] };
  /** Switch recipes off; ones another recipe needs are kept (and reported). */
  remove_recipes: { ids: string[] };
  /** Add models no recipe covers, by qualified name (`@scope/pkg:Class`). */
  add_features: { ids: string[] };
  remove_features: { ids: string[] };
  /** Add the recipes and features of a library cookbook to what is there. */
  add_cookbook: { id: string };
  /** Remove what a library cookbook added (recipes others need are kept). */
  remove_cookbook: { id: string };
  /** Replace the whole app with a library cookbook (needs `replace` if non-empty). */
  apply_cookbook: { id: string; replace?: boolean };
  /** Replace the whole app with a cookbook document (needs `replace` if non-empty). */
  import_cookbook: { document: unknown; replace?: boolean };
  /** Change app settings; tax rate in percent, 0 to 100. */
  set_settings: { currency?: string; taxRate?: number; paymentTerms?: string };
  /**
   * Set (or clear) one field's policy row: its default (JSON value, `null`
   * clears), visibility, label or help. App scope; the model must be on.
   */
  set_policy: {
    model: string;
    field: string;
    defaultValue?: unknown;
    visibility?: 'basic' | 'advanced' | 'hidden' | null;
    label?: string | null;
    help?: string | null;
  };
  /** Change the look: a preset, a brand colour (`#rrggbb`), light or dark. */
  set_theme: {
    preset?: string;
    primary?: string;
    colorScheme?: 'light' | 'dark' | 'system';
  };
  /** Back to the default look. */
  reset_theme: Record<string, never>;
  /** Rename a navigation section (by layout id, e.g. `section:sales`). */
  rename_section: { id: string; label: string };
  /** Rename a menu entry (by nav item id); `null` restores its own name. */
  rename_item: { id: string; label: string | null };
  /** Hide a section or entry from the menu. */
  hide: { id: string };
  /** Show a hidden section or entry again. */
  show: { id: string };
  /** Move the planner's focus to a tab and/or a section. Not a document change. */
  focus: { tab?: PlannerTabId; section?: string };
  /** The cookbook as `<name>.cookbook.json` text. Changes nothing. */
  export_cookbook: { name?: string };
  /** Undo an earlier command by the `undoId` its result carried. */
  undo: { undoId: string; force?: boolean };
}

export type CommandName = keyof CommandInputs;

/** One command: its name and input. The unit `controller.run` takes. */
export type PlannerCommand = {
  [N in CommandName]: { name: N; input: CommandInputs[N] };
}[CommandName];

/** Why a command did not run. Stable strings a client can switch on. */
export type CommandErrorCode =
  /** Not an object with a known `name`, or `input` is not an object. */
  | 'unknown_command'
  /** The input does not match the command's schema, or a value is rejected. */
  | 'invalid_input'
  /** The id names nothing (no such recipe, cookbook, section, undo...). */
  | 'not_found'
  /** The destructive command needs `replace: true` (or `force: true`). */
  | 'confirmation_required'
  /** The plan changed since the caller looked (revision or undo mismatch). */
  | 'conflict'
  /** This controller was built without the part of the app the command needs. */
  | 'unsupported'
  /** The command itself failed; the plan is unchanged. */
  | 'failed';

export interface CommandError {
  code: CommandErrorCode;
  message: string;
}

/** What a recipe/feature command did, after `requires` ran. */
export interface RecipeChanges {
  added: string[];
  removed: string[];
  /** Asked to remove, but another recipe still needs them. */
  kept: string[];
}

/** The compact, read-only plan state: cheap enough for a model prompt. */
export interface PlanSnapshot {
  /** The command set version. */
  version: typeof PLANNER_COMMANDS_VERSION;
  /** Changes whenever the plan does (a command or a manual edit). */
  revision: number;
  app: {
    /** The applied library cookbook's name, else `my-app`. */
    name: string;
    /** The applied library cookbook's id, if one was chosen. */
    cookbook: string | null;
  };
  /** Recipes that are on. */
  recipes: { id: string; label: string }[];
  /** Loose models that were added one at a time (qualified names). */
  features: string[];
  /** Ids in the saved cookbook this version does not know; kept on export. */
  unavailable: string[];
  /** App settings; tax rate in percent. */
  settings: { currency: string; taxRate: number; paymentTerms: string };
  /** The look, in words (`glass, dark`), plus the parts. */
  theme: {
    text: string;
    preset: string | null;
    primary: string | null;
    colorScheme: string;
  };
  /** The menu as the app shows it: sections and entries, with hidden flags. */
  sections: {
    id: string;
    label: string;
    hidden: boolean;
    items: { id: string; label: string; hidden: boolean }[];
  }[];
  /** Where the planner is looking; not saved. */
  focus: { tab: PlannerTabId | null; section: string | null };
  /** Counts of what is customised beyond the above. */
  policies: number;
  /** Undo ids still available, newest last. */
  undo: string[];
}

export interface CommandReceipt {
  /** The command that ran. */
  name: CommandName;
  /** One terse sentence for a chat ("Added Sales, Invoicing."). Empty if no-op. */
  summary: string;
  /** False when the command changed nothing. */
  changed: boolean;
  /** Present when the command can be undone: pass it to `undo`. */
  undoId?: string;
  /** Recipe and feature commands: what really changed. */
  changes?: RecipeChanges;
}

export type CommandResult =
  | {
      ok: true;
      snapshot: PlanSnapshot;
      receipt: CommandReceipt;
      /** Extra output of the command: `export_cookbook` returns the file. */
      data?: unknown;
    }
  | { ok: false; error: CommandError };

export interface RunOptions {
  /** Refuse with `conflict` unless the plan is still at this revision. */
  expectedRevision?: number;
}

/** The result of `export_cookbook`'s `data`. */
export interface ExportData {
  fileName: string;
  text: string;
  cookbook: Cookbook;
}
