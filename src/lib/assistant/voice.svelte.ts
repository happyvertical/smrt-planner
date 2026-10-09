import {
  type BrowserSpeechSupport,
  createSttDictationSource,
  probeBrowserSpeech,
  type STTAdapter,
  type WhisperLocalModel,
} from '@happyvertical/smrt-svelte/browser-ai';

/**
 * Voice typing for the assistant. The browser's own speech recognition is
 * used where it works (Chrome, Edge, Safari). Where it does not (Firefox has
 * none; Brave has the API with no speech service behind it), the visitor is
 * offered a one-time download of a small speech model that then runs on their
 * own device. Nothing is downloaded without their say-so.
 */

/** The downloadable model the offer drives (smrt-svelte's `WhisperLocalModel`). */
export type LocalSpeechModel = WhisperLocalModel;

export type VoiceStatus =
  /** Probing the browser. */
  | 'checking'
  /** The browser's own speech recognition works; nothing to offer. */
  | 'browser'
  /** Not usable here: offer the local model (or turn on a cached one). */
  | 'offer'
  | 'downloading'
  | 'ready'
  | 'error'
  /** The visitor said "not now" for this visit. */
  | 'dismissed';

export type DictationSource = () => Promise<STTAdapter>;

export interface VoiceOptions {
  storage: Storage | null;
  /** Makes the downloadable model. Not called when the browser's works. */
  createModel: () => LocalSpeechModel;
  probe?: () => Promise<BrowserSpeechSupport>;
  /** Builds the dictation source for the browser's own recogniser. */
  browserSource?: () => DictationSource;
  /** Builds the dictation source that records and transcribes locally. */
  localSource?: (model: LocalSpeechModel) => DictationSource;
}

export const VOICE_PREFS_KEY = 'smrt-planner:voice:v1';

/** Whether the visitor has downloaded (and so accepted) the local model. */
export function loadVoiceConsent(storage: Storage | null): boolean {
  try {
    const raw = storage?.getItem(VOICE_PREFS_KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as { local?: unknown }).local === true;
  } catch {
    return false;
  }
}

export function saveVoiceConsent(
  storage: Storage | null,
  local: boolean,
): void {
  try {
    storage?.setItem(VOICE_PREFS_KEY, JSON.stringify({ local }));
  } catch {
    // Not saved; the choice still holds for this visit.
  }
}

/** What to do for a probe result, given what is on the device. */
export type VoicePlan = 'browser' | 'offer' | 'enable-cached';

export function planVoice(
  support: BrowserSpeechSupport,
  consented: boolean,
  cached: boolean,
): VoicePlan {
  if (support === 'works') return 'browser';
  // They already took the download: turn it on without asking again.
  return consented && cached ? 'enable-cached' : 'offer';
}

export class VoiceSession {
  status = $state<VoiceStatus>('checking');
  /** Whether the model files are already on this device. */
  cached = $state(false);
  /** Download progress, 0 to 1. */
  progress = $state(0);
  error = $state('');
  /** The size the offer shows, in bytes. */
  size = $state(0);

  /** The dictation source for the composer, or null when voice is off. */
  dictation = $state.raw<DictationSource | null>(null);

  private model: LocalSpeechModel | null = null;
  private abort: AbortController | null = null;
  private readonly options: VoiceOptions;

  constructor(options: VoiceOptions) {
    this.options = options;
  }

  /** Probe the browser and decide what to offer. Call once. */
  async init(): Promise<void> {
    const support = await (this.options.probe ?? probeBrowserSpeech)();
    if (support === 'works') {
      this.dictation = (
        this.options.browserSource ??
        (() => createSttDictationSource({ type: 'browser-speech' }))
      )();
      this.status = 'browser';
      return;
    }
    const model = this.options.createModel();
    this.model = model;
    this.size = model.estimateSize();
    this.cached = await model.isCached().catch(() => false);
    const plan = planVoice(
      support,
      loadVoiceConsent(this.options.storage),
      this.cached,
    );
    if (plan === 'enable-cached') await this.enable();
    else this.status = 'offer';
  }

  /** Download (or read from the cache) and turn voice typing on. */
  async enable(): Promise<void> {
    const model = this.model;
    if (!model || this.status === 'downloading') return;
    this.status = 'downloading';
    this.error = '';
    this.progress = 0;
    const abort = new AbortController();
    this.abort = abort;
    try {
      await model.load({
        onProgress: (p) => {
          this.progress = p.bytesTotal > 0 ? p.bytesLoaded / p.bytesTotal : 0;
        },
        signal: abort.signal,
      });
      // Consent is kept only once the download completed.
      saveVoiceConsent(this.options.storage, true);
      this.cached = true;
      this.dictation = (
        this.options.localSource ??
        ((m) =>
          createSttDictationSource({
            type: 'whisper-local',
            // The consent flow and the dictation share one loaded model.
            modelHandle: m,
          }))
      )(model);
      this.status = 'ready';
    } catch (error) {
      if (abort.signal.aborted) {
        this.status = 'offer';
      } else {
        this.error = error instanceof Error ? error.message : String(error);
        this.status = 'error';
      }
    } finally {
      this.abort = null;
    }
  }

  /** Stop a download in progress. */
  cancel(): void {
    this.abort?.abort();
  }

  /** "Not now": hide the offer for this visit. */
  dismiss(): void {
    this.status = 'dismissed';
  }

  dispose(): void {
    this.abort?.abort();
    this.model?.dispose();
    this.model = null;
    this.dictation = null;
  }
}
