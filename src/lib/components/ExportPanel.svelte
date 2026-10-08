<script lang="ts">
import { Button } from '@happyvertical/smrt-ui';
import { Alert, ConfirmDialog } from '@happyvertical/smrt-ui/feedback';
import { downloadBlueprint } from '$lib/blueprint/file.ts';
import { blueprintStore } from '$lib/blueprint/store.svelte.ts';
import type { Blueprint } from '$lib/blueprint/types.ts';
import { parseBlueprintText } from '$lib/blueprint/validate.ts';
import { useDataSource } from '$lib/data/context.ts';
import { humanize } from '$lib/data/format.ts';
import { recipesById } from '$lib/recipes/index.ts';

let fileInput: HTMLInputElement | undefined = $state();
/** A validated import waiting for the visitor's confirmation. */
let pending = $state<Blueprint | null>(null);
let error = $state('');
let notice = $state('');
let confirmingReset = $state(false);

const current = $derived(blueprintStore.snapshot());

const describe = (b: Blueprint) =>
  `${b.recipes.length} ${b.recipes.length === 1 ? 'recipe' : 'recipes'}, ${b.features.length} ${b.features.length === 1 ? 'feature' : 'features'}, ${b.policies.length} saved ${b.policies.length === 1 ? 'option' : 'options'}`;

async function choose(event: Event & { currentTarget: HTMLInputElement }) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  error = '';
  notice = '';
  if (!file) return;
  try {
    const result = parseBlueprintText(await file.text());
    if (result.ok) pending = result.blueprint;
    else error = result.error;
  } catch {
    error = 'The file could not be read.';
  }
  // Allow choosing the same file again.
  input.value = '';
}

function confirmImport() {
  if (pending) {
    blueprintStore.replace(pending);
    notice = `Imported ${describe(pending)}.`;
  }
  pending = null;
}

const dataSource = useDataSource();

function confirmReset() {
  blueprintStore.reset();
  // Rows the visitor added, edited or deleted go with the blueprint.
  dataSource.reset?.();
  confirmingReset = false;
  // The shell holds its settings in memory too; reload so it starts from its
  // defaults (the blueprint is already saved empty).
  blueprintStore.flush();
  location.reload();
}
</script>

<div class="export">
  <p class="meta">
    Your recipes, their options and the layout, kept together in this browser.
    Export them as a file, or import one to replace what is here. Sample
    records are not part of it.
  </p>
  <section aria-labelledby="current-heading">
    <h2 id="current-heading">Current blueprint</h2>
    <p>{describe(current)}.</p>
    {#if current.recipes.length}
      <ul>
        {#each current.recipes as id (id)}
          <li>{recipesById.get(id)?.label ?? id}</li>
        {/each}
      </ul>
    {/if}
    {#if current.features.length}
      <ul>
        {#each current.features as id (id)}
          <li>{humanize(id.slice(id.lastIndexOf(':') + 1))}</li>
        {/each}
      </ul>
    {/if}
  </section>

  <div class="actions">
    <Button onclick={() => downloadBlueprint(blueprintStore.snapshot())}>Export</Button>
    <Button variant="secondary" onclick={() => fileInput?.click()}>Import…</Button>
    <Button variant="secondary" onclick={() => (confirmingReset = true)}>Reset</Button>
    <input
      bind:this={fileInput}
      type="file"
      accept="application/json,.json"
      hidden
      aria-label="Blueprint file"
      onchange={choose}
    />
  </div>

  {#if error}
    <Alert variant="error" title="Import failed">{error}</Alert>
  {/if}
  <p class="notice" role="status" aria-live="polite">{notice}</p>
</div>

<ConfirmDialog
  open={pending !== null}
  title="Replace the current blueprint?"
  message={pending
    ? `Importing replaces your ${describe(current)} with ${describe(pending)}.`
    : ''}
  confirmLabel="Replace"
  destructive
  onconfirm={confirmImport}
  oncancel={() => (pending = null)}
/>

<ConfirmDialog
  open={confirmingReset}
  title="Reset the blueprint?"
  message="This removes every recipe and saved option. Export first to keep a copy."
  confirmLabel="Reset"
  destructive
  onconfirm={confirmReset}
  oncancel={() => (confirmingReset = false)}
/>

<style>
  .export {
    display: grid;
    gap: var(--smrt-spacing-4);
  }

  h2,
  p {
    margin: 0;
  }

  .meta,
  .notice {
    color: var(--smrt-color-on-surface-variant);
  }

  .notice:empty {
    display: none;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--smrt-spacing-2);
  }
</style>
