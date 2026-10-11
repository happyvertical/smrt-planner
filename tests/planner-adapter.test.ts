import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeUndos } from '../src/lib/assistant/theme-undo.svelte.ts';
import { cookbookStore } from '../src/lib/cookbook/store.svelte.ts';
import { createHeadlessPlanner } from '../src/lib/core/index.ts';
import { getLibraryCookbook } from '../src/lib/library/index.ts';
import { libraryState } from '../src/lib/library/state.svelte.ts';
import {
  createPlannerAdapter,
  createPlannerController,
  createSliceController,
  engineCatalog,
  portFromStore,
} from '../src/lib/planner/commands/index.ts';
import { recipeState } from '../src/lib/recipes/state.svelte.ts';

function fresh(onReplaced?: () => void) {
  recipeState.clear();
  cookbookStore.reset();
  libraryState.active = null;
  return createPlannerController(cookbookStore, { onReplaced });
}

const SALES = { name: 'add_recipes', input: { ids: ['commerce.sales'] } };

describe('the browser controller is an adapter over the engine', () => {
  beforeEach(() => {
    fresh();
  });

  it('writes what the engine changed into the stores', () => {
    const controller = fresh();
    const added = controller.run(SALES);
    expect(added.ok).toBe(true);
    expect(recipeState.ids).toContain('commerce.sales');
    controller.run({ name: 'set_name', input: { name: 'Corner Shop' } });
    expect(cookbookStore.name).toBe('Corner Shop');
    expect(cookbookStore.snapshot().name).toBe('Corner Shop');
    expect(controller.snapshot().app.name).toBe('Corner Shop');
    controller.run({ name: 'set_theme', input: { preset: 'glass' } });
    expect(cookbookStore.theme?.preset).toBe('glass');
  });

  it('adopts a manual edit as one revision and closes the undo history', () => {
    const controller = fresh();
    const before = controller.snapshot().revision;
    const added = controller.run(SALES);
    if (!added.ok) throw new Error('add failed');
    const undoId = added.receipt.undoId as string;
    expect(controller.snapshot().revision).toBe(before + 1);

    recipeState.add('commerce.purchases');
    const after = controller.snapshot();
    expect(after.revision).toBe(before + 2);
    expect(after.recipes.map((r) => r.id)).toContain('commerce.purchases');
    expect(after.undo).toEqual([]);

    // An undo id from before the edit names nothing now; the edit is kept.
    const stale = controller.run({ name: 'undo', input: { undoId } });
    expect(!stale.ok && stale.error.code).toBe('not_found');
    expect(recipeState.ids).toContain('commerce.purchases');
    // And a model that read the plan before the edit is refused.
    const late = controller.run(
      { name: 'add_recipes', input: { ids: ['commerce.estimates'] } },
      { expectedRevision: before + 1 },
    );
    expect(!late.ok && late.error.code).toBe('conflict');
  });

  it('does not count a page customisation as a plan change', () => {
    const controller = fresh();
    controller.run(SALES);
    const revision = controller.snapshot().revision;
    cookbookStore.setOverview('section:sales', { widgets: [] } as never);
    expect(controller.snapshot().revision).toBe(revision);
    // The next command keeps the page edit.
    controller.run({
      name: 'add_recipes',
      input: { ids: ['commerce.estimates'] },
    });
    expect(cookbookStore.overviews['section:sales']).toBeDefined();
  });

  it('applies a library cookbook as the Cookbooks tab does', () => {
    let replaced = 0;
    const controller = fresh(() => {
      replaced += 1;
    });
    const result = controller.run({
      name: 'apply_cookbook',
      input: { id: 'bakery' },
    });
    expect(result.ok).toBe(true);
    expect(libraryState.active).toBe('bakery');
    expect(replaced).toBe(1);
    expect(controller.snapshot().app).toMatchObject({
      name: 'Bakery',
      cookbook: 'bakery',
    });
  });

  it("keeps the visitor's look when the cookbook sets none, in one undoable step", () => {
    recipeState.clear();
    cookbookStore.reset();
    libraryState.active = null;
    const bakery = getLibraryCookbook('bakery');
    if (!bakery) throw new Error('no bakery');
    const base = engineCatalog();
    const controller = createPlannerAdapter({
      catalog: {
        ...base,
        cookbooks: [
          {
            id: 'plain',
            name: 'Plain',
            document: { ...bakery.document, theme: undefined } as never,
          },
        ],
      },
      port: portFromStore(cookbookStore),
    });
    controller.run({ name: 'set_theme', input: { preset: 'glass' } });
    const revision = controller.snapshot().revision;
    const applied = controller.run({
      name: 'apply_cookbook',
      input: { id: 'plain', replace: true },
    });
    if (!applied.ok) throw new Error(applied.error.message);
    expect(controller.snapshot().theme.preset).toBe('glass');
    expect(cookbookStore.theme?.preset).toBe('glass');
    expect(recipeState.ids.length).toBeGreaterThan(0);
    expect(applied.receipt.revisionBefore).toBe(revision);
    expect(applied.receipt.name).toBe('apply_cookbook');
    const undone = controller.run({
      name: 'undo',
      input: { undoId: applied.receipt.undoId as string },
    });
    expect(undone.ok).toBe(true);
    expect(recipeState.ids).toEqual([]);
    expect(cookbookStore.theme?.preset).toBe('glass');
  });

  it('repeats a command id without applying it twice', () => {
    const controller = fresh();
    const first = controller.run({ ...SALES, id: 'retry-1' });
    const revision = controller.snapshot().revision;
    const again = controller.run({ ...SALES, id: 'retry-1' });
    expect(first.ok && again.ok && again.replayed).toBe(true);
    expect(controller.snapshot().revision).toBe(revision);
    const reused = controller.run({
      name: 'remove_recipes',
      input: { ids: ['commerce.sales'] },
      id: 'retry-1',
    });
    expect(!reused.ok && reused.error.code).toBe('id_reuse');
  });

  it('runs a batch all or nothing against the stores', () => {
    const controller = fresh();
    const failed = controller.batch({
      commands: [
        SALES,
        { name: 'rename_section', input: { id: 'section:nope', label: 'X' } },
      ],
    });
    expect(failed.ok).toBe(false);
    expect(!failed.ok && failed.error.code).toBe('batch_failed');
    expect(recipeState.ids).toEqual([]);
    const done = controller.batch({
      commands: [SALES, { name: 'set_settings', input: { currency: 'CAD' } }],
    });
    expect(done.ok && done.receipt.count).toBe(2);
    expect(recipeState.ids).toContain('commerce.sales');
    expect(cookbookStore.settings().currency).toBe('CAD');
  });

  it('puts only the theme back when the assistant Undo is pressed after other edits', () => {
    const controller = fresh();
    const store = {
      read: () => cookbookStore.snapshot().theme,
      write: (next: Parameters<typeof cookbookStore.setTheme>[0]) =>
        cookbookStore.setTheme(next),
    };
    const undos = new ThemeUndos(store, controller);
    const set = controller.run({
      name: 'set_theme',
      input: { preset: 'glass' },
    });
    if (!set.ok) throw new Error('theme failed');
    const ref = undos.record(undefined, set.receipt.undoId);
    controller.run(SALES);
    undos.undo(ref.undoId);
    expect(cookbookStore.theme).toBeUndefined();
    // The recipe added after the theme is still there: Undo was not the whole document.
    expect(recipeState.ids).toContain('commerce.sales');
  });

  it('focus follows the planner tab and never touches the plan', () => {
    const controller = fresh();
    const revision = controller.snapshot().revision;
    const result = controller.run({ name: 'focus', input: { tab: 'layout' } });
    expect(result.ok && result.receipt.changed).toBe(true);
    expect(controller.snapshot().focus.tab).toBe('layout');
    expect(controller.snapshot().revision).toBe(revision);
  });
});

describe('a controller over slices', () => {
  it('drives plain stores through the same commands', () => {
    const ids: string[] = [];
    const written: unknown[] = [];
    const controller = createSliceController({
      store: {
        get ids() {
          return ids;
        },
        add: (...more) => {
          for (const id of more) if (!ids.includes(id)) ids.push(id);
        },
        remove: (...gone) => {
          for (const id of gone) {
            const at = ids.indexOf(id);
            if (at >= 0) ids.splice(at, 1);
          }
        },
      },
      theme: { read: () => undefined, write: (t) => written.push(t) },
    });
    controller.run({ name: 'add_recipes', input: { ids: ['commerce.sales'] } });
    expect(ids).toContain('commerce.sales');
    controller.run({ name: 'set_theme', input: { preset: 'glass' } });
    expect(written.at(-1)).toMatchObject({ preset: 'glass' });
  });
});

describe('the headless planner', () => {
  it('has the same atomic batch and retry ids as the engine', () => {
    const plan = createHeadlessPlanner();
    const first = plan.batch({ id: 'b1', commands: [SALES] });
    const again = plan.batch({ id: 'b1', commands: [SALES] });
    expect(first.ok && first.receipt.changed).toBe(true);
    expect(again.ok && again.replayed).toBe(true);
    const bad = plan.batch({ commands: [SALES, { name: 'nope', input: {} }] });
    expect(!bad.ok && bad.error.code).toBe('batch_failed');
  });
});
