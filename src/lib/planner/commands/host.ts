import type { ShellLayout } from '@happyvertical/smrt-svelte/workspace/layout';
import type {
  RecipeStore,
  SettingsStore,
  ThemeStore,
} from '../../assistant/change.ts';
import type { Cookbook } from '../../cookbook/types.ts';
import type { LibraryCookbook } from '../../library/types.ts';
import type { FieldPolicyRow } from '../../recipes/policy.ts';
import type { ExposureSurface } from '../../recipes/types.ts';

/** The recipes, features, options and narrowing: the part of the plan recipes own. */
export interface PlanSlice {
  recipes: string[];
  features: string[];
  policies: FieldPolicyRow[];
  exposure?: Record<string, ExposureSurface[]>;
}

/**
 * What the commands need from the app. Everything but `recipes` is optional: a
 * host without a part of the app answers the commands that need it with an
 * `unsupported` error, so the assistant can still run on the slices it has.
 */
export interface PlannerHost {
  recipes: RecipeStore;
  /** Models no recipe covers, added one at a time. */
  features?: {
    read(): readonly string[];
    add(id: string): void;
    remove(id: string): void;
  };
  /** Recipe and feature ids the loaded cookbook names that this version lacks. */
  unavailable?: () => readonly string[];
  settings?: SettingsStore;
  theme?: ThemeStore;
  layout?: {
    read(): ShellLayout | undefined;
    write(layout: ShellLayout | undefined): void;
  };
  /** App-scope field policy rows, for `set_policy`. */
  policies?: {
    read(): readonly FieldPolicyRow[];
    write(rows: FieldPolicyRow[]): void;
    /** Is the field policy-locked (a recipe forbids changing it)? */
    locked(model: string, field: string): boolean;
  };
  /** The exact plan slice, for undo and replace. Without it undo diffs recipes. */
  plan?: {
    read(): PlanSlice;
    write(plan: PlanSlice): void;
  };
  /** The whole document, for cookbook, import and export commands. */
  cookbook?: {
    snapshot(): Cookbook;
    /** Replace everything; the caller already validated the document. */
    replace(cookbook: Cookbook): void;
    /** Apply a library cookbook the way the Cookbooks tab does; an error or null. */
    applyLibrary(cookbook: LibraryCookbook): string | null;
    /** The library cookbook the app was last set up from, if any. */
    applied(): string | null;
  };
}
