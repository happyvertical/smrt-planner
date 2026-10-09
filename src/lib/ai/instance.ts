import { createLocalSpeechModel } from '../assistant/voice-host.ts';
import { browserStorage } from '../blueprint/storage.ts';
import { recipes } from '../recipes/index.ts';
import { recipeState } from '../recipes/state.svelte.ts';
import { AiState } from './state.svelte.ts';

/** The app's one AI state: shared by the sidebar, the AI page and the assistant. */
export const aiState = new AiState({
  storage: browserStorage(),
  session: { store: recipeState, recipes },
  voice: { createModel: createLocalSpeechModel },
});
