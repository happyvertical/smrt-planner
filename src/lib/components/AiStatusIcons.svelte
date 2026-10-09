<script lang="ts">
// Think, Hear and Speak as three icon links for the sidebar footer. Each opens
// the AI models page and shows its state: ready (tinted circle), available
// (plain) or off (dashed outline, muted).
import { Icon } from '@happyvertical/smrt-ui';
import { HEAR_ICON, SPEAK_ICON, THINK_ICON } from '../ai/icons.ts';
import { aiState } from '../ai/instance.ts';
import type { CapabilityId } from '../ai/status.ts';
import { appHref } from '../planner/app.svelte.ts';

const icons: Record<CapabilityId, string> = {
  think: THINK_ICON,
  hear: HEAR_ICON,
  speak: SPEAK_ICON,
};
</script>

<div class="ai-status" role="group" aria-label="AI models">
  {#each aiState.capabilities as capability (capability.id)}
    <a
      href={appHref('/ai/')}
      class="cap"
      data-state={capability.state}
      aria-label={capability.label}
      title={capability.label}
    >
      <Icon path={icons[capability.id]} size={20} />
    </a>
  {/each}
</div>

<style>
  .ai-status {
    display: flex;
    gap: var(--smrt-spacing-2);
    padding: var(--smrt-spacing-2);
  }

  .cap {
    display: inline-grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    border: 1px solid transparent;
    color: var(--smrt-color-on-surface);
    text-decoration: none;
  }

  .cap:hover {
    background: var(--smrt-color-surface-container-high, transparent);
  }

  .cap:focus-visible {
    outline: 2px solid var(--smrt-color-primary);
    outline-offset: 2px;
  }

  .cap[data-state='ready'] {
    background: var(--smrt-color-success-container);
    color: var(--smrt-color-on-success-container);
  }

  .cap[data-state='off'] {
    border: 1px dashed var(--smrt-color-outline);
    color: var(--smrt-color-on-surface-variant);
  }
</style>
