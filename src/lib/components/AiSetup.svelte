<script lang="ts">
import { Icon } from '@happyvertical/smrt-ui';
import { HEAR_ICON, SPEAK_ICON, THINK_ICON } from '../ai/icons.ts';
import { aiState } from '../ai/instance.ts';
import type { CapabilityId } from '../ai/status.ts';
import {
  ASSISTANT_MODELS,
  formatSize,
  getModel,
  shortLabel,
} from '../assistant/models.ts';

interface AiSetupProps {
  /** Which cards to show; all three by default. */
  show?: CapabilityId[];
}

let { show = ['think', 'hear', 'speak'] }: AiSetupProps = $props();

const session = $derived(aiState.session);
const voice = $derived(aiState.voice);
const summaries = $derived(aiState.capabilities);
const state = (id: CapabilityId) =>
  summaries.find((s) => s.id === id)?.state ?? 'available';

const model = $derived(getModel(session.prefs.modelId));
const thinkPercent = $derived(Math.round(session.progress.progress * 100));
const hearPercent = $derived(Math.round(voice.progress * 100));
const hearMegabytes = $derived(Math.round(voice.size / 1_000_000));
</script>

<div class="cards">
  {#if show.includes('think')}
    <section class="card" data-state={state('think')} aria-labelledby="ai-think">
      <header>
        <span class="badge"><Icon path={THINK_ICON} size={22} /></span>
        <div>
          <h2 id="ai-think">Think</h2>
          <p class="sub">The assistant's language model</p>
        </div>
      </header>
      {#if session.status === 'unsupported'}
        <p role="status">
          This browser has no WebGPU, which the model needs. Try a recent
          Chrome, Edge or Safari on a computer. The Planner works without it.
        </p>
      {:else}
        <label>
          Model
          <select
            value={session.prefs.modelId}
            disabled={session.status === 'loading'}
            onchange={(event) => session.select(event.currentTarget.value)}
          >
            {#each ASSISTANT_MODELS as option (option.id)}
              <option value={option.id}>{option.label}</option>
            {/each}
          </select>
        </label>
        {#if model}
          <p class="meta">
            {formatSize(model.downloadMB)} to download once; needs
            {formatSize(model.vramMB)} of graphics memory. Use Wi-Fi on a
            metered connection.
          </p>
        {/if}
        {#if session.status === 'ready'}
          <p class="status" role="status">
            {model ? shortLabel(model) : 'The model'} is ready.
          </p>
          <div class="actions">
            <button type="button" onclick={() => session.unload()}>Unload</button>
          </div>
        {:else if session.status === 'loading'}
          <div role="status" aria-live="polite">
            <progress max="100" value={thinkPercent} aria-label="Model download progress"
              >{thinkPercent}%</progress
            >
            <p class="meta">{thinkPercent}%. {session.progress.text}</p>
          </div>
          <div class="actions">
            <button type="button" onclick={() => session.cancel()}>Cancel</button>
          </div>
        {:else}
          <p class="status">
            {session.consented ? 'Downloaded. Load it to start.' : 'Not downloaded.'}
          </p>
          {#if session.status === 'error'}
            <p class="error" role="alert">
              The model could not start: {session.error}
            </p>
          {/if}
          <div class="actions">
            <button type="button" onclick={() => void session.start()}>
              {session.consented ? 'Load' : 'Download'}
            </button>
          </div>
        {/if}
      {/if}
    </section>
  {/if}

  {#if show.includes('hear')}
    <section class="card" data-state={state('hear')} aria-labelledby="ai-hear">
      <header>
        <span class="badge"><Icon path={HEAR_ICON} size={22} /></span>
        <div>
          <h2 id="ai-hear">Hear</h2>
          <p class="sub">Voice typing, speech to text</p>
        </div>
      </header>
      {#if voice.status === 'checking'}
        <p class="meta" role="status">Checking this browser.</p>
      {:else if voice.status === 'browser'}
        <p class="status">Built into your browser.</p>
      {:else if voice.status === 'downloading'}
        <div role="status" aria-live="polite">
          <progress max="100" value={hearPercent} aria-label="Speech model download"
            >{hearPercent}%</progress
          >
          <p class="meta">
            {voice.cached ? 'Turning on' : 'Downloading'} {hearPercent}%
          </p>
        </div>
        <div class="actions">
          <button type="button" onclick={() => voice.cancel()}>Cancel</button>
        </div>
      {:else if voice.status === 'ready'}
        <p class="status">Downloaded speech model, running on this device.</p>
      {:else}
        <p class="meta">
          {voice.browserWorks
            ? 'You chose the downloadable model.'
            : "Your browser can't do voice typing on its own."}
          {formatSize(hearMegabytes)}, downloaded once.
          {voice.cached ? 'It is already on this device.' : ''}
        </p>
        {#if voice.status === 'error'}
          <p class="error" role="alert">
            Voice typing could not start: {voice.error}
          </p>
        {/if}
        <div class="actions">
          <button type="button" onclick={() => void voice.enable()}>
            {voice.cached ? 'Turn on' : 'Download'}
          </button>
        </div>
      {/if}
      {#if voice.browserWorks && voice.status !== 'downloading'}
        <label class="check">
          <input
            type="checkbox"
            checked={voice.preferLocal}
            onchange={(event) => void voice.setPreferLocal(event.currentTarget.checked)}
          />
          Use the downloadable model instead
        </label>
      {/if}
    </section>
  {/if}

  {#if show.includes('speak')}
    <section class="card" data-state={state('speak')} aria-labelledby="ai-speak">
      <header>
        <span class="badge"><Icon path={SPEAK_ICON} size={22} /></span>
        <div>
          <h2 id="ai-speak">Speak</h2>
          <p class="sub">Read replies aloud, text to speech</p>
        </div>
      </header>
      {#if aiState.speakSupported}
        <p class="status">Browser voices</p>
        <label class="check">
          <input
            type="checkbox"
            role="switch"
            checked={aiState.prefs.readAloud}
            onchange={(event) => aiState.setReadAloud(event.currentTarget.checked)}
          />
          Read replies aloud
        </label>
        <p class="meta">A better voice you can download is coming.</p>
      {:else}
        <p role="status">This browser has no speech synthesis.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: var(--smrt-spacing-4);
    min-width: 0;
  }

  .card {
    display: grid;
    align-content: start;
    gap: var(--smrt-spacing-3);
    padding: var(--smrt-spacing-4);
    min-width: 0;
    overflow-wrap: anywhere;
    border: 1px solid var(--smrt-color-outline-variant);
    border-radius: var(--smrt-radius-lg, 12px);
    background: var(--smrt-color-surface-container-low, transparent);
  }

  .card[data-state='off'] {
    border-style: dashed;
    color: var(--smrt-color-on-surface-variant);
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--smrt-spacing-3);
  }

  .badge {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    border: 1px solid var(--smrt-color-outline-variant);
  }

  .card[data-state='ready'] .badge {
    background: var(--smrt-color-success-container);
    color: var(--smrt-color-on-success-container);
    border-color: transparent;
  }

  .card[data-state='off'] .badge {
    border-style: dashed;
  }

  h2,
  p {
    margin: 0;
  }

  .sub,
  .meta,
  label {
    color: var(--smrt-color-on-surface-variant);
  }

  .status {
    font-weight: 600;
  }

  label {
    display: grid;
    gap: var(--smrt-spacing-1);
  }

  .check {
    display: flex;
    align-items: center;
    gap: var(--smrt-spacing-2);
  }

  select,
  button {
    box-sizing: border-box;
    max-width: 100%;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--smrt-spacing-2);
  }

  progress {
    width: 100%;
  }

  .error {
    color: var(--smrt-color-error);
  }
</style>
