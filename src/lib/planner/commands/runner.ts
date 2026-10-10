import type { ShellLayout } from '@happyvertical/smrt-svelte/workspace/layout';
import type { AppSettings } from '../../settings/app-settings.ts';
import type { ThemeSetting } from '../../theme/theme.ts';
import { execute } from './execute.ts';
import type { PlannerHost, PlanSlice } from './host.ts';
import { checkSchema, commandSchemas, type JsonSchema } from './schemas.ts';
import { buildSnapshot } from './snapshot.ts';
import {
  type CommandError,
  type CommandErrorCode,
  type CommandName,
  type CommandResult,
  PLANNER_TAB_IDS,
  type PlannerCommand,
  type PlannerTabId,
  type PlanSnapshot,
  type RecipeChanges,
  type RunOptions,
} from './types.ts';

/*
 * The command runner: every rule of the command set (validation, revisions,
 * undo, receipts, snapshots) over a `PlannerHost`, in plain TypeScript with no
 * runes. The browser controller (`controller.svelte.ts`) wraps it with
 * reactive cells and effects; the headless planner (`../../core/headless.ts`)
 * runs it over plain state in Node. Nothing here may be duplicated there.
 */

/** Which parts of the app a command changes, so Undo restores just those. */
type SliceKey = 'plan' | 'settings' | 'theme' | 'layout';

/** What a command changes and Undo can put back. Whole-app commands have no Undo. */
const TOUCHES: Partial<Record<CommandName, SliceKey[]>> = {
  add_recipes: ['plan'],
  remove_recipes: ['plan'],
  add_features: ['plan'],
  remove_features: ['plan'],
  add_cookbook: ['plan'],
  remove_cookbook: ['plan'],
  set_policy: ['plan'],
  set_settings: ['settings'],
  set_theme: ['theme'],
  reset_theme: ['theme'],
  rename_section: ['layout'],
  rename_item: ['layout'],
  hide: ['layout'],
  show: ['layout'],
};

/** Commands that change the whole app; they report `changed` themselves. */
const WHOLE_APP: ReadonlySet<CommandName> = new Set([
  'apply_cookbook',
  'import_cookbook',
]);

interface Slices {
  plan?: PlanSlice;
  settings?: AppSettings;
  theme?: { value: ThemeSetting | undefined };
  layout?: { value: ShellLayout | undefined };
}

interface UndoEntry {
  keys: SliceKey[];
  before: Slices;
  after: Slices;
  used: boolean;
}

/** The most Undo entries kept; the oldest is forgotten first. */
const MAX_UNDO = 20;

/** Copies a value out of whatever holds it (a reactive proxy) as plain data. */
type Plain = <T>(value: T) => T;

function readSlices(
  host: PlannerHost,
  keys: readonly SliceKey[],
  clone: Plain,
): Slices {
  const out: Slices = {};
  for (const key of keys) {
    if (key === 'plan') {
      out.plan = clone(
        host.plan?.read() ?? {
          recipes: [...host.recipes.ids],
          features: [...(host.features?.read() ?? [])],
          policies: [...(host.policies?.read() ?? [])],
        },
      );
    } else if (key === 'settings' && host.settings) {
      out.settings = clone(host.settings.read());
    } else if (key === 'theme' && host.theme) {
      out.theme = { value: clone(host.theme.read()) };
    } else if (key === 'layout' && host.layout) {
      out.layout = { value: clone(host.layout.read()) };
    }
  }
  return out;
}

function writeSlices(host: PlannerHost, slices: Slices, clone: Plain): void {
  const { plan } = slices;
  if (plan) {
    if (host.plan) {
      host.plan.write(clone(plan));
    } else {
      // A host with only a recipe store: put the recipes back by difference.
      const want = new Set(plan.recipes);
      const have = new Set(host.recipes.ids);
      const extra = [...have].filter((id) => !want.has(id));
      if (extra.length) host.recipes.remove(...extra);
      const missing = [...want].filter((id) => !have.has(id));
      if (missing.length) host.recipes.add(...missing);
    }
  }
  if (slices.settings && host.settings) host.settings.write(slices.settings);
  if (slices.theme && host.theme) host.theme.write(clone(slices.theme.value));
  if (slices.layout && host.layout) {
    host.layout.write(clone(slices.layout.value));
  }
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** How the controller reads and moves the planner's own view. */
export interface PlannerNavigation {
  getTab(): PlannerTabId | null;
  setTab(tab: PlannerTabId): void;
  /** Open a menu section's page; the host decides what that means. */
  setSection?(sectionId: string): void;
}

export interface PlannerControllerOptions {
  /** The planner tab, so `focus` and the snapshot follow the real UI. */
  navigation?: PlannerNavigation;
  /**
   * Called after a library cookbook was applied, so the app can regenerate its
   * sample records (they are not part of a cookbook), as the Cookbooks tab does.
   */
  onReplaced?: () => void;
}

/**
 * The planner as a headless object: typed commands in, a compact snapshot
 * out. The planner's own assistant, a host page, an MCP server and the CLI
 * all drive the app through this one seam.
 */
export interface PlannerController {
  /**
   * Run one command. Never throws: a bad command, unknown id or refused edit
   * comes back as `{ ok: false, error }` and leaves the app unchanged.
   */
  run(command: PlannerCommand, options?: RunOptions): CommandResult;
  /** Untyped form for commands that arrive as data (a model's tool call). */
  run(command: unknown, options?: RunOptions): CommandResult;
  /** The current plan, read-only and compact. */
  snapshot(): PlanSnapshot;
  /**
   * Call `listener` with the current snapshot now and after every change,
   * whether a command or a manual edit made it. Returns the unsubscribe.
   */
  subscribe(listener: (snapshot: PlanSnapshot) => void): () => void;
}

/** A value the runner reads and writes; reactive in the browser, a variable elsewhere. */
export interface Cell<T> {
  get(): T;
  set(value: T): void;
}

/** A plain cell. */
export function cell<T>(initial: T): Cell<T> {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
}

/** What differs between the browser controller and plain Node. All optional. */
export interface RunnerEnv {
  /** Cells for state a snapshot shows; the browser passes `$state` ones. */
  undoIds?: Cell<string[]>;
  section?: Cell<string | null>;
  tab?: Cell<PlannerTabId | null>;
  /** Copy a value out of a reactive proxy (`$state.snapshot`); default identity. */
  plain?: Plain;
  /** The input schemas to validate against; default the full library's. */
  schemas?: Readonly<Record<CommandName, JsonSchema>>;
  /** The first listener arrived / the last one left (the browser starts effects). */
  watch?: { start(): void; stop(): void };
}

/** The controller plus the two hooks the browser wrapper's effects need. */
export interface CommandRunner extends PlannerController {
  /**
   * Build the snapshot and return its signature. Reading it subscribes an
   * effect to every store it is built from; it does not notify.
   */
  observe(): string;
  /** Tell listeners about the current snapshot if it changed since they heard. */
  deliver(): void;
}

const error = (code: CommandErrorCode, message: string): CommandResult => ({
  ok: false,
  error: { code, message },
});

/** A command as a client sends it: `{ name, input }`; a missing input is `{}`. */
function readCommand(
  value: unknown,
  schemas: Readonly<Record<CommandName, JsonSchema>>,
):
  | { ok: true; name: CommandName; input: Record<string, unknown> }
  | { ok: false; error: CommandError } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      error: {
        code: 'unknown_command',
        message: 'A command is an object: { name, input }.',
      },
    };
  }
  const { name, input = {} } = value as { name?: unknown; input?: unknown };
  if (typeof name !== 'string' || !Object.hasOwn(schemas, name)) {
    return {
      ok: false,
      error: {
        code: 'unknown_command',
        message: `Unknown command ${JSON.stringify(name)}.`,
      },
    };
  }
  const problem = checkSchema(schemas[name as CommandName], input);
  if (problem) {
    return { ok: false, error: { code: 'invalid_input', message: problem } };
  }
  return {
    ok: true,
    name: name as CommandName,
    input: input as Record<string, unknown>,
  };
}

/**
 * The runner over any host. Everything the browser controller and the
 * headless planner do with a command happens here.
 */
export function createCommandRunner(
  host: PlannerHost,
  options: PlannerControllerOptions = {},
  env: RunnerEnv = {},
): CommandRunner {
  const schemas = env.schemas ?? commandSchemas;
  const plain: Plain = env.plain ?? ((value) => value);
  const clone: Plain = (value) =>
    value === undefined ? value : structuredClone(plain(value));
  const undos = new Map<string, UndoEntry>();
  let undoCounter = 0;
  /** Undo ids still available, newest last. */
  const undoIds = env.undoIds ?? cell<string[]>([]);
  const section = env.section ?? cell<string | null>(null);
  const tab = env.tab ?? cell<PlannerTabId | null>(null);
  let revision = 0;
  let lastPlanKey = '';
  const listeners = new Map<(snapshot: PlanSnapshot) => void, string>();

  const currentTab = () => options.navigation?.getTab() ?? tab.get();

  function build(): { snapshot: PlanSnapshot; full: string } {
    const base = buildSnapshot(host, {
      revision: 0,
      focus: { tab: currentTab(), section: section.get() },
      undo: [...undoIds.get()],
    });
    // The revision follows the plan itself, not where the planner is looking.
    const planKey = JSON.stringify({ ...base, focus: null, undo: null });
    if (planKey !== lastPlanKey) {
      lastPlanKey = planKey;
      revision += 1;
    }
    const snapshot = { ...base, revision };
    return { snapshot, full: JSON.stringify(snapshot) };
  }

  const snapshot = () => build().snapshot;

  function deliver(): void {
    if (!listeners.size) return;
    const { snapshot: current, full } = build();
    for (const [listener, last] of listeners) {
      if (last === full) continue;
      listeners.set(listener, full);
      listener(current);
    }
  }

  function succeed(
    name: CommandName,
    summary: string,
    extra: {
      changed: boolean;
      undoId?: string;
      changes?: RecipeChanges;
      data?: unknown;
    },
  ): CommandResult {
    const result: CommandResult = {
      ok: true,
      snapshot: snapshot(),
      receipt: {
        name,
        summary,
        changed: extra.changed,
        ...(extra.undoId ? { undoId: extra.undoId } : {}),
        ...(extra.changes ? { changes: extra.changes } : {}),
      },
      ...(extra.data !== undefined ? { data: extra.data } : {}),
    };
    deliver();
    return result;
  }

  function runUndo(input: { undoId: string; force?: boolean }): CommandResult {
    const entry = undos.get(input.undoId);
    if (!entry || entry.used) {
      return error('not_found', `Nothing to undo for "${input.undoId}".`);
    }
    if (
      !input.force &&
      !same(readSlices(host, entry.keys, clone), entry.after)
    ) {
      return error(
        'conflict',
        'That part of the app changed since; send force: true to undo anyway.',
      );
    }
    writeSlices(host, entry.before, clone);
    entry.used = true;
    undoIds.set(undoIds.get().filter((id) => id !== input.undoId));
    return succeed('undo', 'Undone.', { changed: true });
  }

  function runFocus(input: {
    tab?: PlannerTabId;
    section?: string;
  }): CommandResult {
    let changed = false;
    if (input.section !== undefined) {
      const known = snapshot().sections.some((s) => s.id === input.section);
      if (!known) {
        return error('not_found', `No menu section "${input.section}".`);
      }
    }
    if (input.tab && PLANNER_TAB_IDS.includes(input.tab)) {
      changed ||= currentTab() !== input.tab;
      tab.set(input.tab);
      options.navigation?.setTab(input.tab);
    }
    if (input.section !== undefined) {
      changed ||= section.get() !== input.section;
      section.set(input.section);
      options.navigation?.setSection?.(input.section);
    }
    return succeed('focus', '', { changed });
  }

  function run(command: unknown, runOptions: RunOptions = {}): CommandResult {
    try {
      const parsed = readCommand(command, schemas);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const { name, input } = parsed;
      if (
        runOptions.expectedRevision !== undefined &&
        runOptions.expectedRevision !== snapshot().revision
      ) {
        return error(
          'conflict',
          `The plan is at revision ${snapshot().revision}, not ${runOptions.expectedRevision}. Read the snapshot and try again.`,
        );
      }
      if (name === 'undo') {
        return runUndo(input as { undoId: string; force?: boolean });
      }
      if (name === 'focus') {
        return runFocus(input as { tab?: PlannerTabId; section?: string });
      }
      const keys = TOUCHES[name];
      const before = keys ? readSlices(host, keys, clone) : undefined;
      const outcome = execute(host, name, input as never);
      if (!outcome.ok) return { ok: false, error: outcome.error };
      let changed = WHOLE_APP.has(name);
      let undoId: string | undefined;
      if (keys && before) {
        const after = readSlices(host, keys, clone);
        changed = !same(before, after);
        if (changed) {
          undoId = `undo-${++undoCounter}`;
          undos.set(undoId, { keys, before, after, used: false });
          undoIds.set([...undoIds.get(), undoId].slice(-MAX_UNDO));
          for (const id of [...undos.keys()]) {
            if (!undoIds.get().includes(id)) undos.delete(id);
          }
        }
      }
      return succeed(name, changed ? outcome.summary : '', {
        changed,
        undoId,
        changes: outcome.changes,
        data: outcome.data,
      });
    } catch (cause) {
      return error(
        'failed',
        cause instanceof Error ? cause.message : String(cause),
      );
    }
  }

  return {
    run,
    snapshot,
    observe: () => build().full,
    deliver,
    subscribe(listener) {
      env.watch?.start();
      const { snapshot: current, full } = build();
      listeners.set(listener, full);
      listener(current);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) env.watch?.stop();
      };
    },
  };
}
