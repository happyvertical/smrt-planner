<script lang="ts">
import { AssistantDock } from '@happyvertical/smrt-chat/svelte';
import { Button } from '@happyvertical/smrt-ui';
import type { DataSurfaceRegistry } from '@happyvertical/smrt-ui/data-surface';
import { aiState } from '../ai/instance.ts';
import { getModel } from '../assistant/models.ts';
import { isOfferRef } from '../assistant/offers.svelte.ts';
import { createHandsFreeCapture as handsFreeCapture } from '../assistant/voice-host.ts';
import { blueprintStore } from '../blueprint/store.svelte.ts';
import { applyCookbook, needsConfirm } from '../cookbooks/apply.ts';
import { getCookbook } from '../cookbooks/index.ts';
import { cookbookState } from '../cookbooks/state.svelte.ts';
import { useDataSource } from '../data/context.ts';
import { appHref } from '../planner/app.svelte.ts';
import { settingsOfCookbook } from '../settings/app-settings.ts';
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
const dataSource = useDataSource();

// Applying a cookbook runs the Cookbooks tab's path, with the cookbook's own
// settings. It only ever runs from the confirm button below.
$effect(() => {
  const offers = session.offers;
  offers.applier = (cookbook) => {
    const result = applyCookbook(
      cookbook,
      blueprintStore,
      settingsOfCookbook(cookbook.settings),
    );
    if (!result.ok) return result.error;
    dataSource.reset?.();
    cookbookState.select(cookbook.id);
    return null;
  };
  return () => {
    offers.applier = null;
  };
});
</script>

{#snippet offerCard(message: { toolCallData?: unknown })}
  {#if isOfferRef(message.toolCallData)}
    {@const offer = session.offers.offers[message.toolCallData.offerId]}
    {@const cookbook = offer ? getCookbook(offer.cookbookId) : undefined}
    {#if offer && cookbook}
      {#if offer.status === 'pending'}
        <div class="offer" role="group" aria-label="Use {cookbook.name} cookbook">
          <Button onclick={() => session.offers.accept(offer.id)}>
            Use {cookbook.name}
          </Button>
          <Button variant="secondary" onclick={() => session.offers.decline(offer.id)}>
            No thanks
          </Button>
          {#if needsConfirm(blueprintStore)}
            <small>Replaces your recipes, menu and sample records.</small>
          {/if}
        </div>
      {:else if offer.status === 'applied'}
        <p class="offer-note" role="status">{cookbook.name} set up.</p>
      {:else if offer.status === 'failed'}
        <p class="offer-note" role="alert">{offer.error}</p>
      {/if}
    {/if}
  {/if}
{/snippet}

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
        <Button variant="secondary" onclick={() => session.unload()}>Change model</Button>
      </div>
      <VoiceTyping {voice} />
    </div>
    <div class="dock">
      <AssistantDock
        transport={session.transport}
        {registry}
        contextMode="server"
        conversations="single"
        composerPlaceholder="I run a bakery…"
        toolCall={offerCard}
        dictation={voice.dictation}
        dictationMode={aiState.handsFreeActive ? 'hands-free' : 'push'}
        {handsFreeCapture}
        sendOnPause={aiState.sendOnPauseActive}
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

  .offer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--smrt-spacing-2);
    margin-top: var(--smrt-spacing-2);
  }

  .offer small,
  .offer-note {
    color: var(--smrt-color-on-surface-variant);
  }

  .offer-note {
    margin: var(--smrt-spacing-2) 0 0;
  }

  h2,
  p {
    margin: 0;
  }

  p {
    color: var(--smrt-color-on-surface-variant);
  }
</style>
