import { createWhisperLocalModel } from '@happyvertical/smrt-svelte/browser-ai';
import WhisperWorker from '@happyvertical/smrt-svelte/browser-ai/whisper-worker?worker';
import type { LocalSpeechModel } from './voice.svelte.ts';

/**
 * The real speech model: Whisper in a Web Worker, built by this app because
 * the worker is the one module that imports `@huggingface/transformers`, so
 * only this app's bundler pulls that library in. Kept apart from the voice
 * logic so tests never load a worker.
 */
export function createLocalSpeechModel(): LocalSpeechModel {
  return createWhisperLocalModel({ createWorker: () => new WhisperWorker() });
}
