import type { ShellLayout } from '@happyvertical/smrt-svelte/workspace/layout';
import type { Blueprint } from '../blueprint/types.ts';

/**
 * `ShellLayout` plus the per-entry rename smrt-svelte is adding
 * (`layout.items[<navItemId>].label`). The planner writes it today; it renders
 * once the installed smrt-svelte reads it, and the cookbook preview reads the
 * same labels either way. Delete this type when `ShellLayout` carries `items`.
 */
export type CookbookLayout = ShellLayout & {
  items?: Record<string, { label?: string; description?: string }>;
};

/** The app-wide defaults a cookbook sets (the policy rows realise them). */
export interface CookbookSettings {
  /** ISO currency code, e.g. `USD`. */
  currency?: string;
  /** Default payment terms on customer-facing documents and customers. */
  paymentTerms?: string;
  /** Default line-item tax rate as a fraction (0.0825 is 8.25%). */
  taxRate?: number;
}

/** A curated, ready-made blueprint with the words that introduce it. */
export interface Cookbook {
  id: string;
  name: string;
  /** A key of `COOKBOOK_ICONS`. */
  icon: string;
  summary: string;
  settings: CookbookSettings;
  /**
   * One line per custom section (`custom:<id>`), shown under its title on the
   * section's page. The section's icon is in `blueprint.layout.sections`.
   */
  sectionDescriptions?: Record<string, string>;
  /** The same document the Export tab saves. */
  blueprint: Blueprint;
}

export interface CookbookFile {
  cookbooks: Cookbook[];
}

export interface MenuEntry {
  id: string;
  label: string;
}

export interface MenuSection {
  id: string;
  label: string;
  entries: MenuEntry[];
}
