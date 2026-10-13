<script lang="ts">
import type { ShellSlotItem } from '@happyvertical/smrt-svelte/app';
import {
  applyCookbookTheme,
  buildCookbookShell,
  CookbookApp,
} from '@happyvertical/smrt-svelte/cookbook';
import {
  ShellDockTool,
  ShellSectionIcon,
} from '@happyvertical/smrt-svelte/workspace';
import type { DataSurfaceRegistry } from '@happyvertical/smrt-ui/data-surface';
import { type ComponentProps, onMount, tick, untrack } from 'svelte';
import smrtMark from '../assets/smrt-mark.svg';
import { catalog, getModel } from '../catalog/index.ts';
import AdvancedStyles from '../components/AdvancedStyles.svelte';
import AiModelsPage from '../components/AiModelsPage.svelte';
import BrowserAssistant from '../components/BrowserAssistant.svelte';
import ModelWorkspace from '../components/ModelWorkspace.svelte';
import PackagePage from '../components/PackagePage.svelte';
import SectionView from '../components/SectionView.svelte';
import ThemeBridge from '../components/ThemeBridge.svelte';
import { cookbookStore, SHELL_STORAGE_KEY } from '../cookbook/store.svelte.ts';
import type { Cookbook } from '../cookbook/types.ts';
import { provideDataSource, tryUseDataSource } from '../data/context.ts';
import { createPlannerDataSource } from '../data/planner-source.ts';
import { activeForms } from '../forms/active.ts';
import { runViewTransition } from '../motion/view-transition.ts';
import { plannerLoaders, resolveRecipeExport } from '../overviews/registry.ts';
import { recipes } from '../recipes/index.ts';
import { recipeState } from '../recipes/state.svelte.ts';
import { sectionIdFromSlug } from '../sections/path.ts';
import { DEFAULT_PRESET } from '../theme/theme.ts';
import { setBasePath } from './app.svelte.ts';
import PlannerControls from './PlannerControls.svelte';
import PlannerLifecycle from './PlannerLifecycle.svelte';
import { PLANNER_ASSISTANT_TOGGLE, plannerShellProps } from './shell.ts';
import { currentPlannerTitle } from './title.svelte.ts';
import type { PlannerProps } from './types.ts';

let {
  controller,
  basePath,
  inference,
  persistence,
  themeControls = true,
  tabs,
  backLink,
  onready,
}: PlannerProps = $props();

/** The mount's links: its pages are fragment routes, so no host router. */
const hashHref = (path: string) => `#${path}`;
// Before anything below renders a link: the planner-wide `appHref` writes
// fragments too (`PlannerLifecycle` follows `basePath` when it changes).
setBasePath(untrack(() => basePath) ?? '', 'hash');
/** The AI models page inside the mount; the dock links here. */
const AI_HREF = hashHref('/ai/');
/** The assistant exists only when the host gave the planner a model. */
const assistant = $derived(inference !== undefined);

const shellCatalog: ComponentProps<typeof CookbookApp>['catalog'] = {
  recipes: recipes.map(({ id, label, nav, models, group, section }) => ({
    id,
    label,
    nav,
    models,
    group,
    section,
  })),
  models: catalog.packages.flatMap((pkg) =>
    pkg.models.map((model) => ({
      id: model.id,
      name: model.name,
      packageId: pkg.id,
      description: model.description,
      exposed: model.exposed,
    })),
  ),
};
// The shell falls back to its own default preset; give it the Planner's so the
// shell provider and ThemeBridge agree when a cookbook names no theme.
const cookbook = $derived.by(() => {
  const value = cookbookStore.snapshot();
  return value.theme?.preset || value.theme?.custom
    ? value
    : { ...value, theme: { ...value.theme, preset: DEFAULT_PRESET } };
});
const title = $derived(currentPlannerTitle());
const shell = $derived(
  buildCookbookShell({
    cookbook: cookbook as ComponentProps<typeof CookbookApp>['cookbook'],
    catalog: shellCatalog,
  }),
);
const defaultRoute = $derived.by(() => {
  const orderedId = cookbook.layout?.sectionOrder?.find(
    (id) =>
      !cookbook.layout?.hidden?.includes(id) &&
      Object.hasOwn(shell.overviews, id),
  );
  const firstId = orderedId ?? shell.sections[0]?.id;
  return firstId ? shell.sectionPath(firstId) : '/configure/';
});
const source =
  tryUseDataSource() ?? provideDataSource(createPlannerDataSource());
// What the overview widgets' loaders read when they run in this browser: the
// sample source and the mount's links. The shell adds the resolved sections
// and entries for its shortcuts.
const widgetContext = () => ({ source, href: hashHref });
let route = $state('');
// The mount's own hash router. Each change morphs through a view transition
// (the chrome named below stays put, the content crossfades); the first read
// paints plainly. `tick` keeps the DOM update inside the transition's
// callback, where the browser snapshots the new state.
onMount(() => {
  // One hash change fires both `hashchange` and `popstate`, and `route` is
  // only assigned inside the transition callback (after the old frame is
  // captured), so the target is tracked synchronously to transition once.
  let target = location.hash.slice(1);
  route = target;
  const read = () => {
    const next = location.hash.slice(1);
    if (next === target) return;
    target = next;
    void runViewTransition(async () => {
      route = next;
      await tick();
    });
  };
  window.addEventListener('hashchange', read);
  window.addEventListener('popstate', read);
  return () => {
    window.removeEventListener('hashchange', read);
    window.removeEventListener('popstate', read);
  };
});

const currentRoute = $derived(route || defaultRoute);
const pathParts = $derived(currentRoute.split('/').filter(Boolean));
const sectionSlug = $derived(pathParts[0] === 's' ? pathParts[1] : undefined);
const packageId = $derived(
  pathParts[0] === 'packages' ? pathParts[1] : undefined,
);
const model = $derived(
  pathParts[0] === 'm' ? getModel(pathParts[1], pathParts[2]) : undefined,
);
const applied = $derived(model ? recipeState.apply(model) : undefined);
const forms = $derived(
  model ? activeForms(recipeState.ids, recipes, model.id) : [],
);

function updateCookbook(next: ComponentProps<typeof CookbookApp>['cookbook']) {
  cookbookStore.apply(next as Cookbook);
}

const slotItems = $derived<ShellSlotItem[]>([
  ...(backLink
    ? [
        {
          id: 'planner-back',
          label: backLink.label,
          slot: 'header.start' as const,
          render: back,
        },
      ]
    : []),
  {
    id: 'planner-customize',
    label: 'Customize',
    slot: 'header.end' as const,
    render: customize,
  },
]);
// The shell's own `dock:assistant` button (header end, the dock tab on phones)
// opens the assistant dock; before a model is ready the dock shows the setup.
const dockToggles = $derived(assistant ? [PLANNER_ASSISTANT_TOGGLE] : []);
</script>

{#snippet back()}
  <a class="back" href={backLink?.href} data-planner-back>
    <span aria-hidden="true">←</span>
    <span>{backLink?.label}</span>
  </a>
{/snippet}

{#snippet assistantDock(registry: DataSurfaceRegistry)}
  <ShellDockTool id="assistant" label="Assistant">
    {#snippet render()}
      <BrowserAssistant {registry} settingsHref={AI_HREF} />
    {/snippet}
  </ShellDockTool>
{/snippet}

{#snippet customize()}
  <a class="customize" href="#/configure/" aria-label="Customize" title="Customize">
    <ShellSectionIcon name="edit" />
  </a>
{/snippet}

<!--
  The shell's pencil (`layoutEditing`, start of the header) edits the menu
  and every section overview in place; each edit comes back through
  `oncookbookchange` and lands in the cookbook's `layout` / `overviews`, so it
  is saved, exported and imported with the rest of the plan. `loaders`,
  `widgetContext` and `resolveExport` wire the framework's own section pages
  (`CookbookSectionPage`) to the sample data; the mount renders the planner's
  `SectionView` instead because 0.55.17's `CookbookSectionPage` forwards no
  `presentation` (its overview is framed cards in a card) and takes no
  shortcuts loader (no record counts).
-->
<CookbookApp
  cookbook={cookbook as ComponentProps<typeof CookbookApp>['cookbook']}
  catalog={shellCatalog}
  {title}
  href={hashHref}
  currentHref={`#${currentRoute}`}
  homeHref={`#${defaultRoute}`}
  storageKey={SHELL_STORAGE_KEY}
  logoSrc={smrtMark}
  {slotItems}
  {dockToggles}
  dock={assistant ? assistantDock : undefined}
  loaders={plannerLoaders}
  {widgetContext}
  resolveExport={resolveRecipeExport}
  layoutEditing={{ slot: 'header.start' }}
  oncookbookchange={updateCookbook}
  {...plannerShellProps()}
>
  <ThemeBridge deferInitial={persistence === 'host'} presetOverride={applyCookbookTheme(shell.theme)} />
  <PlannerLifecycle {controller} {basePath} {inference} {persistence} {onready} links="hash" />
  <main class="content">
    {#if sectionSlug}
      {#key sectionSlug}
        <SectionView sectionId={sectionIdFromSlug(sectionSlug)} href={hashHref} />
      {/key}
    {:else if packageId}
      <PackagePage id={packageId} backHref="#/configure/" />
    {:else if pathParts[0] === 'advanced-styles'}
      <AdvancedStyles backHref="#/configure/" />
    {:else if pathParts[0] === 'ai'}
      <AiModelsPage backHref="#/configure/" />
    {:else if applied && model}
      <ModelWorkspace model={applied.model} fields={applied.fields} {forms} />
    {:else}
      <PlannerControls {controller} {basePath} {inference} {persistence} {themeControls} {tabs} managedByParent layout="shell" advancedStylesHref="#/advanced-styles/" />
    {/if}
  </main>
</CookbookApp>

<style>
@layer smrt.reset, smrt.structure, smrt.theme;
@layer smrt.theme {
  /* `view-transition-name`s: one per surface per screen (a duplicate aborts
     the transition). AppShell names its brand, nav and dock (`smrt-shell-*`,
     reserved); these are the planner's own. */
  .content { width: min(100%, 72rem); margin-inline: auto; padding: var(--smrt-spacing-6); view-transition-name: planner-content; }
  .customize { display: inline-grid; place-items: center; inline-size: 2rem; block-size: 2rem; color: inherit; border-radius: var(--smrt-radius-medium, 0.5rem); view-transition-name: planner-customize; }
  .customize:hover { background: var(--smrt-color-surface-container-high); }
  .customize:focus-visible { outline: 2px solid var(--smrt-color-primary); outline-offset: 2px; }
  .back { display: inline-flex; align-items: center; gap: var(--smrt-spacing-1); block-size: 2rem; padding-inline: var(--smrt-spacing-2); color: var(--smrt-color-on-surface-variant); font-size: var(--smrt-typography-body-small-size, 0.8125rem); text-decoration: none; white-space: nowrap; border-radius: var(--smrt-radius-medium, 0.5rem); view-transition-name: planner-back; }
  .back:hover { background: var(--smrt-color-surface-container-high); color: var(--smrt-color-on-surface); }
  .back:focus-visible { outline: 2px solid var(--smrt-color-primary); outline-offset: 2px; }
}
</style>
