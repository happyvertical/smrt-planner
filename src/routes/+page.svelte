<script lang="ts">
import { ShellLayoutEditor } from '@happyvertical/smrt-svelte/workspace';
import { Tabs } from '@happyvertical/smrt-ui';
import ExportPanel from '$lib/components/ExportPanel.svelte';
import RecipeCards from '$lib/components/RecipeCards.svelte';
import {
  PLANNER_TABS,
  type PlannerTab,
  plannerTab,
} from '$lib/planner/tab.svelte.ts';

const tabs = [
  { id: 'recipes', label: 'Recipes' },
  { id: 'layout', label: 'Layout' },
  { id: 'export', label: 'Export' },
];

// All three panels stay mounted (the inactive ones hidden), so switching
// never resets a notice or an editor; the layout keeps the URL in step.
const select = (id: string) => {
  const tab = PLANNER_TABS.find((t) => t === id);
  if (tab) plannerTab.active = tab satisfies PlannerTab;
};
</script>

<svelte:head>
  <title>Planner · smrt planner</title>
</svelte:head>

<main>
  <Tabs {tabs} active={plannerTab.active} onchange={select} aria-label="Planner">
    <div hidden={plannerTab.active !== 'recipes'}><RecipeCards /></div>
    <div hidden={plannerTab.active !== 'layout'} class="pane">
      <p class="meta">
        Reorder, move or hide navigation entries and choose which panels show.
        The layout is saved with the blueprint.
      </p>
      <ShellLayoutEditor />
    </div>
    <div hidden={plannerTab.active !== 'export'}><ExportPanel /></div>
  </Tabs>
</main>

<style>
  main {
    width: min(100%, 72rem);
    margin-inline: auto;
    padding: var(--smrt-spacing-6);
  }

  main :global(.tab-panel) {
    padding-top: var(--smrt-spacing-4);
  }

  .pane {
    display: grid;
    gap: var(--smrt-spacing-3);
  }

  /* `display: grid` would otherwise override the inactive pane's `hidden`. */
  .pane[hidden] {
    display: none;
  }

  .meta {
    margin: 0;
    color: var(--smrt-color-on-surface-variant);
  }
</style>
