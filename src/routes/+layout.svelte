<script lang="ts">
import { AppShell } from '@happyvertical/smrt-svelte/app';
import {
  ShellDockTool,
  type ShellNavGroup,
  type ShellNavItem,
} from '@happyvertical/smrt-svelte/workspace';
import { afterNavigate, replaceState } from '$app/navigation';
import { page } from '$app/state';
import {
  blueprintStore,
  SHELL_STORAGE_KEY,
} from '$lib/blueprint/store.svelte.ts';
import { exposedModels, getPackage } from '$lib/catalog/index.ts';
import BrowserAssistant from '$lib/components/BrowserAssistant.svelte';
import PlannerEditBridge from '$lib/components/PlannerEditBridge.svelte';
import SectionActions from '$lib/components/SectionActions.svelte';
import { provideDataSource } from '$lib/data/context.ts';
import { humanize } from '$lib/data/format.ts';
import { createMemoryDataSource } from '$lib/data/source.ts';
import { PROFILE_TYPE, SAVED_BY_FORMS } from '$lib/forms/stock.ts';
import { appHref, appQuery } from '$lib/planner/app.svelte.ts';
import { hasAppState, withTab } from '$lib/planner/query.ts';
import { selection } from '$lib/planner/selection.svelte.ts';
import { plannerTab } from '$lib/planner/tab.svelte.ts';
import {
  buildNavSections,
  recipeNav,
  recipes,
  sectionId,
} from '$lib/recipes/index.ts';
import { recipeState } from '$lib/recipes/state.svelte.ts';
import type { LayoutProps } from './$types';

let { children }: LayoutProps = $props();

// The seam for live objects: swap this for a collection-backed DataSource.
provideDataSource(
  createMemoryDataSource({
    // Fields the views hide still carry their policy default, e.g. the
    // `contractType` that tells an Order from a PurchaseOrder.
    defaults: (model) => recipeState.apply(model).background,
    // Rows that only make sense under a product a form creates start empty,
    // as do Profile types: a form adds the one it needs.
    empty: [...SAVED_BY_FORMS, PROFILE_TYPE],
  }),
);

// No Planner entry: the shell's Edit layout toggle goes to the Planner page.
const nav: ShellNavItem[] = [];

// Navigation sections belong to the app: a recipe only suggests one
// (`recipe.section`, else its group, else itself), and the user overrides it in
// the Layout tab. Recipes suggesting the same section share it, entries
// de-duplicated in recipe declaration order. Each recipe's main (first) item
// carries the gear to ITS options page (keyed by `group`, not by section), shown
// while that item is current. Help is an icon in page headers, not an entry.
const recipeGroups: ShellNavGroup[] = $derived.by(() => {
  const added = recipeState.ids.flatMap((id) => {
    const recipe = recipes.find((r) => r.id === id);
    return recipe ? [recipe] : [];
  });
  return buildNavSections(added).map((section) => {
    const seen = new Set<string>();
    const items: ShellNavItem[] = [];
    for (const recipe of section.recipes) {
      const optionsHref = appHref(`/recipes/${sectionId(recipe)}/`);
      const optionsLabel = `${recipe.group?.label ?? recipe.label} options`;
      let main = true;
      for (const entry of recipeNav(recipe)) {
        const dedupe = `${entry.model.id}:${entry.label}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        // Stable ids keep a saved layout valid when the selection query in the
        // hrefs changes.
        items.push({
          id: `section:${section.id}:${entry.packageId}:${entry.model.name}:${entry.label}`,
          href: appHref(`/m/${entry.packageId}/${entry.model.name}/`),
          label: entry.label,
          ...(main
            ? {
                action: {
                  href: optionsHref,
                  label: optionsLabel,
                  visibility: 'active' as const,
                },
              }
            : {}),
        });
        main = false;
      }
    }
    return { id: `section:${section.id}`, heading: section.label, items };
  });
});

// Options/Help groups per navigation section, for the layout edit mode's
// section actions (a nav section can hold several recipes' items).
const sectionOptionGroups = $derived.by(() => {
  const added = recipeState.ids.flatMap((id) => {
    const recipe = recipes.find((r) => r.id === id);
    return recipe ? [recipe] : [];
  });
  const map = new Map<string, { id: string; label: string }[]>();
  for (const section of buildNavSections(added)) {
    const groups: { id: string; label: string }[] = [];
    for (const recipe of section.recipes) {
      const id = sectionId(recipe);
      if (!groups.some((g) => g.id === id)) {
        groups.push({ id, label: recipe.group?.label ?? recipe.label });
      }
    }
    map.set(`section:${section.id}`, groups);
  }
  return map;
});

const packageGroups: ShellNavGroup[] = $derived(
  selection.ids.flatMap((id) => {
    const pkg = getPackage(id);
    if (!pkg) return [];
    return [
      {
        id: `package:${pkg.id}`,
        heading: humanize(pkg.id),
        items: [
          {
            id: `package:${pkg.id}:overview`,
            href: appHref(`/packages/${pkg.id}/`),
            label: 'Overview',
          },
          ...exposedModels(pkg).map((model) => ({
            id: `package:${pkg.id}:${model.name}`,
            href: appHref(`/m/${pkg.id}/${model.name}/`),
            label: model.name,
          })),
        ],
      },
    ];
  }),
);

const navGroups: ShellNavGroup[] = $derived([
  ...recipeGroups,
  ...packageGroups,
]);

// The URL carries the package selection so a mock-up can be shared; recipes,
// options and layout are the blueprint, saved in localStorage. Pages are
// prerendered, so both are only read in the browser, after navigation.
let ready = false;
let hydrated = false;

const onPlanner = () => page.route.id === '/';

function syncUrl() {
  // A legacy link that could not be saved keeps its URL: it is the only copy.
  if (blueprintStore.keepLegacyUrl) return;
  // The tab belongs to the Planner page only; other pages drop it.
  const wanted = onPlanner()
    ? withTab(appQuery(), plannerTab.active)
    : appQuery();
  if (location.search !== wanted) {
    replaceState(`${location.pathname}${wanted}${location.hash}`, page.state);
  }
}

afterNavigate((navigation) => {
  // Read the saved blueprint once, and fold a legacy ?r= / ?o= link into it.
  // syncUrl below then drops those parameters, as appQuery no longer has them.
  if (!hydrated) {
    hydrated = true;
    blueprintStore.hydrate(location.search);
  }
  if (hasAppState(location.search)) selection.fromSearch(location.search);
  if (onPlanner()) plannerTab.fromSearch(location.search);
  // SvelteKit runs the initial 'enter' callbacks before the router counts as
  // started, and replaceState throws until then, so wait one microtask.
  const sync = () => {
    ready = true;
    syncUrl();
  };
  if (navigation.type === 'enter') queueMicrotask(sync);
  else sync();
});

// Keep the address bar in step with the selection as it changes.
$effect(() => {
  // appQuery reads every part of the shareable state, so this tracks them all.
  void appQuery();
  void blueprintStore.keepLegacyUrl;
  void plannerTab.active;
  void page.route.id;
  if (ready) syncUrl();
});

// Save the blueprint soon after any change; the store ignores this until the
// saved one has been read, so loading never overwrites it with an empty one.
$effect(() => {
  // Reading it all (layout is deep) subscribes the effect to every part.
  void JSON.stringify(blueprintStore.snapshot());
  blueprintStore.scheduleSave();
});

function flushOnHide() {
  if (document.visibilityState === 'hidden') blueprintStore.flush();
}
</script>

<svelte:window onpagehide={() => blueprintStore.flush()} />
<svelte:document onvisibilitychange={flushOnHide} />

<AppShell
  storageKey={SHELL_STORAGE_KEY}
  title="smrt planner"
  subtitle="Add recipes, watch the app assemble"
  {nav}
  {navGroups}
  currentHref={page.url.pathname + appQuery()}
  environment="static demo"
  layout={blueprintStore.layout ?? null}
  onlayoutchange={(next) => blueprintStore.setLayout(next)}
  dockToggles={[{ tool: 'assistant', label: 'Assistant', slot: 'leftSidebar.footer' }]}
  layoutEditing
>
  {#snippet sectionActions({ sectionId: navSectionId, label })}
    <SectionActions {label} groups={sectionOptionGroups.get(navSectionId) ?? []} />
  {/snippet}
  {#snippet dock(registry)}
    <ShellDockTool id="assistant" label="Assistant">
      {#snippet render()}
        <BrowserAssistant {registry} />
      {/snippet}
    </ShellDockTool>
  {/snippet}
  {#if blueprintStore.persist === 'memory'}
    <p class="storage-notice" role="status">
      This browser is not saving your blueprint, so it is kept in memory only. Export it from the Planner's Export tab to keep a copy.
    </p>
  {/if}
  {#if blueprintStore.loadNotice}
    <p class="storage-notice" role="status">{blueprintStore.loadNotice}</p>
  {/if}
  <PlannerEditBridge />
  {@render children()}
</AppShell>

<style>
  .storage-notice {
    margin: 0;
    padding: var(--smrt-spacing-2) var(--smrt-spacing-6);
    background: var(--smrt-color-surface-container);
    color: var(--smrt-color-on-surface-variant);
  }
</style>
