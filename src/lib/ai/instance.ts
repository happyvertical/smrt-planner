import { createSpeechModel } from '../assistant/voice-host.ts';
import { browserStorage } from '../blueprint/storage.ts';
import { blueprintStore } from '../blueprint/store.svelte.ts';
import { recipes } from '../recipes/index.ts';
import { recipeState } from '../recipes/state.svelte.ts';
import { AiState } from './state.svelte.ts';

/** The app's one AI state: shared by the sidebar, the AI page and the assistant. */
export const aiState = new AiState({
  storage: browserStorage(),
  session: {
    store: recipeState,
    recipes,
    settings: {
      read: () => blueprintStore.settings(),
      write: (settings) => blueprintStore.setSettings(settings),
    },
    theme: {
      read: () => blueprintStore.snapshot().theme,
      write: (theme) => blueprintStore.setTheme(theme),
    },
  },
  voice: { createModel: createSpeechModel },
});
