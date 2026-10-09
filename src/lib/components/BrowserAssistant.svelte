<script lang="ts">
import { AssistantDock } from '@happyvertical/smrt-chat/svelte';
import type { DataSurfaceRegistry } from '@happyvertical/smrt-ui/data-surface';
import { aiState } from '../ai/instance.ts';
import { getModel } from '../assistant/models.ts';
import { appHref } from '../planner/app.svelte.ts';
import AiSetup from './AiSetup.svelte';
import VoiceTyping from './VoiceTyping.svelte';

interface BrowserAssistantProps {
  /** The registry the shell gives its `dock` snippet. */
  registry: DataSurfaceRegistry;
}

let { registry }: BrowserAssistantProps = $props();

// The model and voice live in the shared AI state (the sidebar icons and the
// AI models page read the same), so closing the dock keeps them loaded.
const session = $derived(aiState.session);
const voice = $derived(aiState.voice);
const model = $derived(getModel(session.prefs.modelId));
</script>

<div class="assistant">
  {#if session.status === 'unsupported'}
    <div class="panel" role="status">
      <h2>Assistant unavailable</h2>
      <p>
        The assistant runs a small model on your graphics card using WebGPU, and
        this browser does not offer it. Try a recent Chrome, Edge or Safari on a
        computer. Nothing else changes: the cards on the Planner page add and
        remove recipes without it.
      </p>
    </div>
  {:else if session.status === 'ready'}
    <div class="top">
      <div class="bar">
        <span>{model?.label}</span>
        <button type="button" onclick={() => session.unload()}>Change model</button>
      </div>
      <VoiceTyping {voice} />
    </div>
    <div class="dock">
      <AssistantDock
        transport={session.transport}
        {registry}
        contextMode="server"
        conversations="single"
        composerPlaceholder="Describe your business, e.g. I sell clothes online"
        dictation={voice.dictation}
      />
    </div>
  {:else}
    <div class="panel">
      <h2>Assistant</h2>
      <p>
        Describe your business and an assistant adds the matching recipes. It
        runs on your own device, so nothing you type leaves this page.
      </p>
      <AiSetup show={['think']} />
      <a href={appHref('/ai/')}>All AI settings</a>
    </div>
  {/if}
</div>

<style>
  .assistant {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .top {
    min-width: 0;
  }

  .dock {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--smrt-spacing-3);
    padding: var(--smrt-spacing-4);
    align-content: start;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--smrt-spacing-2);
    padding: var(--smrt-spacing-2) var(--smrt-spacing-4);
    min-width: 0;
    flex-wrap: wrap;
    color: var(--smrt-color-on-surface-variant);
  }

  h2,
  p {
    margin: 0;
  }

  p {
    color: var(--smrt-color-on-surface-variant);
  }
</style>
