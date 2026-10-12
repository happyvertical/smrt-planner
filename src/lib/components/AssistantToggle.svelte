<script lang="ts">
// The assistant's header icon. With a model ready it opens and closes the
// `assistant` dock tool; before that it is a link to the AI models page, so a
// first click sets inference up instead of opening an empty chat.
import { useShellDock } from '@happyvertical/smrt-svelte/workspace';
import { aiState } from '../ai/instance.ts';

interface AssistantToggleProps {
  /** The AI models page: `appHref('/ai/')` in the app, `#/ai/` in a mount. */
  settingsHref: string;
}

let { settingsHref }: AssistantToggleProps = $props();

const dock = useShellDock();
const TOOL = 'assistant';
const ready = $derived(
  aiState.assistantReady && dock.has(TOOL) && dock.available,
);
const open = $derived(ready && dock.isOpen(TOOL));

function press(event: MouseEvent) {
  dock.toggle(TOOL, { returnFocus: event.currentTarget as HTMLElement });
}
</script>

{#snippet bubble()}
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 20.5l1.6-5A8.5 8.5 0 1 1 21 11.5z" />
  </svg>
{/snippet}

{#if ready}
  <!-- raw-primitive-allow: shell chrome toggle, not a content button -->
  <button
    type="button"
    class="assistant-toggle"
    class:active={open}
    data-dock-tool={TOOL}
    aria-label="Assistant"
    title="Assistant"
    aria-pressed={open}
    aria-expanded={open}
    aria-controls="smrt-admin-shell-right-panel"
    onclick={press}
  >
    {@render bubble()}
  </button>
{:else}
  <a
    class="assistant-toggle"
    data-dock-tool={TOOL}
    data-assistant-setup
    href={settingsHref}
    aria-label="Set up the assistant"
    title="Set up the assistant"
  >
    {@render bubble()}
  </a>
{/if}

<style>
  .assistant-toggle {
    display: inline-grid;
    place-items: center;
    inline-size: 2.25rem;
    block-size: 2.25rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--smrt-radius-md, 0.5rem);
    background: transparent;
    color: var(--smrt-color-on-surface);
    text-decoration: none;
    cursor: pointer;
  }

  .assistant-toggle:hover {
    background: var(--smrt-color-surface-container-high);
  }

  .assistant-toggle.active {
    background: var(--smrt-color-secondary-container);
    color: var(--smrt-color-on-secondary-container);
  }

  .assistant-toggle:focus-visible {
    outline: 2px solid var(--smrt-color-primary);
    outline-offset: 2px;
  }
</style>
