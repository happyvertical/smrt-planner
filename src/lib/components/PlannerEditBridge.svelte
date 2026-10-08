<script lang="ts">
// The shell's Edit layout toggle is the way into the planner: turning edit mode
// on goes to the Planner page (remembering where the visitor was), and Done or
// Escape returns them there. There is no Planner entry in the navigation.
import { useShellLayout } from '@happyvertical/smrt-svelte/workspace';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { appHref } from '$lib/planner/app.svelte.ts';

const layout = useShellLayout();

let returnTo: string | null = null;
let wasEditing = false;

const plannerPath = $derived(new URL(appHref('/'), page.url).pathname);

$effect(() => {
  const editing = layout.editing;
  if (editing === wasEditing) return;
  wasEditing = editing;
  const here = page.url.pathname + page.url.search;
  if (editing) {
    if (page.url.pathname !== plannerPath) {
      returnTo = here;
      void goto(appHref('/'));
    }
  } else if (returnTo) {
    const target = returnTo;
    returnTo = null;
    void goto(target);
  }
});
</script>
