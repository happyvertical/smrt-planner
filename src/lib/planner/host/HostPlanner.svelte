<script lang="ts">
import { onMount } from 'svelte';
import { ThemeProvider } from '@happyvertical/smrt-ui/themes';
import ThemeBridge from '../../components/ThemeBridge.svelte';
import Planner from '../Planner.svelte';
import { createHostSession, type CallKitchenTool, type HostPlan, type HostSession } from './session.svelte.ts';
let { callTool, initial, onready }: { callTool: CallKitchenTool; initial?: HostPlan; onready?: (session: HostSession) => void } = $props();
const session = createHostSession((name, args) => callTool(name, args));
onMount(() => {
  const stop = session.mount();
  if (initial) session.refresh(initial);
  onready?.(session);
  return stop;
});
</script>
{#if session.error}<p role="alert">{session.error}</p>{/if}
{#if session.draft && session.error}
  <details><summary>Preserved edit</summary><textarea readonly value={JSON.stringify(session.draft, null, 2)} aria-label="Preserved cookbook edit"></textarea></details>
  {#if session.retryable}<button disabled={session.busy} onclick={() => session.retry()}>Retry same edit</button>{/if}
{/if}
{#if session.current}
  <fieldset disabled={session.busy || session.retryable} aria-busy={session.busy}>
    <ThemeProvider><ThemeBridge /><Planner persistence="host" themeControls={true} /></ThemeProvider>
  </fieldset>
{:else}<p role="status">Waiting for a Kitchen plan…</p>{/if}
<style>fieldset { border: 0; padding: 0; min-width: 0; } textarea { width: 100%; min-height: 12rem; }</style>
