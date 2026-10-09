import { describe, expect, it, vi } from 'vitest';
import {
  type LocalSpeechModel,
  loadVoiceConsent,
  planVoice,
  VOICE_PREFS_KEY,
  VoiceSession,
} from '../src/lib/assistant/voice.svelte.ts';

function storage(initial?: string) {
  const data = new Map<string, string>();
  if (initial) data.set(VOICE_PREFS_KEY, initial);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as unknown as Storage;
}

function fakeModel(options: { cached?: boolean; fail?: Error } = {}) {
  const model = {
    estimateSize: () => 45_100_000,
    isCached: vi.fn(async () => options.cached ?? false),
    load: vi.fn(
      async (loadOptions?: {
        onProgress?: (p: {
          bytesLoaded: number;
          bytesTotal: number;
          percent: number;
        }) => void;
        signal?: AbortSignal;
      }) => {
        if (options.fail) throw options.fail;
        loadOptions?.onProgress?.({
          bytesLoaded: 10,
          bytesTotal: 40,
          percent: 25,
        });
        if (loadOptions?.signal) {
          await new Promise<void>((_resolve, reject) => {
            if (loadOptions.signal?.aborted) reject(new Error('cancelled'));
            loadOptions.signal?.addEventListener('abort', () =>
              reject(new Error('cancelled')),
            );
          });
        }
      },
    ),
    dispose: vi.fn(),
  };
  return model as unknown as LocalSpeechModel & typeof model;
}

const browserSource = () => () => Promise.reject(new Error('unused'));

describe('planVoice', () => {
  it('uses the browser where it works, whatever else is on the device', () => {
    expect(planVoice('works', true, true)).toBe('browser');
  });

  it('offers the download where speech is missing or unreliable', () => {
    expect(planVoice('missing', false, false)).toBe('offer');
    expect(planVoice('unreliable', false, false)).toBe('offer');
  });

  it('turns a downloaded model on without asking again, only with consent and a cache', () => {
    expect(planVoice('missing', true, true)).toBe('enable-cached');
    expect(planVoice('missing', true, false)).toBe('offer');
    expect(planVoice('missing', false, true)).toBe('offer');
  });
});

describe('loadVoiceConsent', () => {
  it('reads the saved choice and survives broken or missing storage', () => {
    expect(loadVoiceConsent(storage('{"local":true}'))).toBe(true);
    expect(loadVoiceConsent(storage('not json'))).toBe(false);
    expect(loadVoiceConsent(null)).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(loadVoiceConsent(throwing)).toBe(false);
  });
});

describe('VoiceSession', () => {
  it('passes the browser source through and never makes the model', async () => {
    const createModel = vi.fn();
    const source = () => Promise.reject(new Error('unused'));
    const voice = new VoiceSession({
      storage: storage(),
      createModel,
      probe: async () => 'works',
      browserSource: () => source,
    });
    await voice.init();
    expect(voice.status).toBe('browser');
    expect(voice.dictation).toBe(source);
    expect(createModel).not.toHaveBeenCalled();
  });

  it('offers the download with its size and downloads nothing until asked', async () => {
    const model = fakeModel();
    const voice = new VoiceSession({
      storage: storage(),
      createModel: () => model,
      probe: async () => 'unreliable',
      browserSource,
    });
    await voice.init();
    expect(voice.status).toBe('offer');
    expect(voice.size).toBe(45_100_000);
    expect(voice.cached).toBe(false);
    expect(voice.dictation).toBeNull();
    expect(model.load).not.toHaveBeenCalled();
  });

  it('downloads on request, remembers the choice, and hands over the local source', async () => {
    const model = fakeModel({ fail: undefined });
    model.load.mockImplementation(async (o) => {
      o?.onProgress?.({ bytesLoaded: 20, bytesTotal: 40, percent: 50 });
    });
    const store = storage();
    const local = () => Promise.reject(new Error('unused'));
    const voice = new VoiceSession({
      storage: store,
      createModel: () => model,
      probe: async () => 'missing',
      localSource: () => local,
    });
    await voice.init();
    await voice.enable();
    expect(voice.status).toBe('ready');
    expect(voice.progress).toBe(0.5);
    expect(voice.dictation).toBe(local);
    expect(loadVoiceConsent(store)).toBe(true);
  });

  it('turns a downloaded model on by itself on a later visit', async () => {
    const model = fakeModel({ cached: true });
    model.load.mockResolvedValue(undefined);
    const voice = new VoiceSession({
      storage: storage('{"local":true}'),
      createModel: () => model,
      probe: async () => 'missing',
      localSource: () => () => Promise.reject(new Error('unused')),
    });
    await voice.init();
    expect(voice.status).toBe('ready');
    expect(voice.cached).toBe(true);
  });

  it('shows the already-downloaded offer when cached without a saved choice', async () => {
    const voice = new VoiceSession({
      storage: storage(),
      createModel: () => fakeModel({ cached: true }),
      probe: async () => 'missing',
    });
    await voice.init();
    expect(voice.status).toBe('offer');
    expect(voice.cached).toBe(true);
  });

  it('cancel returns to the offer and saves no consent', async () => {
    const model = fakeModel();
    const store = storage();
    const voice = new VoiceSession({
      storage: store,
      createModel: () => model,
      probe: async () => 'missing',
    });
    await voice.init();
    const enabling = voice.enable();
    expect(voice.status).toBe('downloading');
    voice.cancel();
    await enabling;
    expect(voice.status).toBe('offer');
    expect(loadVoiceConsent(store)).toBe(false);
    expect(voice.dictation).toBeNull();
  });

  it('shows a failure and lets the visitor try again', async () => {
    const model = fakeModel({ fail: new Error('offline') });
    const voice = new VoiceSession({
      storage: storage(),
      createModel: () => model,
      probe: async () => 'missing',
    });
    await voice.init();
    await voice.enable();
    expect(voice.status).toBe('error');
    expect(voice.error).toBe('offline');
    model.load.mockResolvedValueOnce(undefined);
    await voice.enable();
    expect(voice.status).toBe('ready');
  });

  it('"not now" hides the offer for the visit', async () => {
    const voice = new VoiceSession({
      storage: storage(),
      createModel: () => fakeModel(),
      probe: async () => 'missing',
    });
    await voice.init();
    voice.dismiss();
    expect(voice.status).toBe('dismissed');
  });
});
