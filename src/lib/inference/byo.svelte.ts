import type { ChatModel } from '../assistant/transport.ts';
import type { ByoPresetDefinition } from './config.ts';
import {
  type ConnectionResult,
  createOpenAIChat,
  normalizeBaseUrl,
  testConnection,
} from './openai.ts';
import { resolvePresets } from './presets.ts';

/** Choices (not the key): which endpoint, its address and model, and whether it is in use. */
export const BYO_PREFS_KEY = 'smrt-planner:inference:v1';
/** The keys, apart from the choices so nothing that copies prefs copies a key. */
export const BYO_KEYS_KEY = 'smrt-planner:inference-key:v1';

export interface ByoEntry {
  baseUrl: string;
  model: string;
}

interface ByoPrefs {
  preset: string;
  active: boolean;
  entries: Record<string, ByoEntry>;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

export function loadByoPrefs(storage: Storage | null): ByoPrefs {
  const prefs: ByoPrefs = { preset: '', active: false, entries: {} };
  try {
    const raw = storage?.getItem(BYO_PREFS_KEY);
    if (!raw) return prefs;
    const value: unknown = JSON.parse(raw);
    if (!isObject(value)) return prefs;
    if (typeof value.preset === 'string') prefs.preset = value.preset;
    prefs.active = value.active === true;
    if (isObject(value.entries)) {
      for (const [id, entry] of Object.entries(value.entries)) {
        if (
          isObject(entry) &&
          typeof entry.baseUrl === 'string' &&
          typeof entry.model === 'string'
        ) {
          prefs.entries[id] = { baseUrl: entry.baseUrl, model: entry.model };
        }
      }
    }
  } catch {
    // Unreadable or unavailable: start empty.
  }
  return prefs;
}

export function loadByoKeys(storage: Storage | null): Record<string, string> {
  const keys: Record<string, string> = {};
  try {
    const raw = storage?.getItem(BYO_KEYS_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (isObject(value)) {
      for (const [id, key] of Object.entries(value)) {
        if (typeof key === 'string' && key) keys[id] = key;
      }
    }
  } catch {
    // Unreadable or unavailable: no keys.
  }
  return keys;
}

export type ByoTestStatus = 'idle' | 'testing' | 'ok' | 'failed';

export interface ByoOptions {
  storage: Storage | null;
  /** The config's `byo.presets`; default all built-ins. */
  presets?: readonly (string | ByoPresetDefinition)[];
  fetch?: typeof fetch;
  /** Called after "use" or "stop using", so the assistant follows. */
  onChange?: () => void;
}

/**
 * The visitor's own OpenAI-compatible endpoint: the preset they picked, its
 * address, model and key, a connection test, and whether the assistant uses
 * it. The key lives only in this browser's localStorage and is only ever sent
 * as the Authorization header to the chosen address.
 */
export class ByoModel {
  readonly presets: ByoPresetDefinition[];
  presetId = $state('');
  entries = $state<Record<string, ByoEntry>>({});
  keys = $state<Record<string, string>>({});
  active = $state(false);
  testStatus = $state<ByoTestStatus>('idle');
  testMessage = $state('');

  private readonly options: ByoOptions;

  constructor(options: ByoOptions) {
    this.options = options;
    this.presets = resolvePresets(options.presets);
    const prefs = loadByoPrefs(options.storage);
    this.keys = loadByoKeys(options.storage);
    this.entries = prefs.entries;
    this.presetId = this.presets.some((p) => p.id === prefs.preset)
      ? prefs.preset
      : (this.presets[0]?.id ?? '');
    this.active = prefs.active && this.complete;
  }

  get preset(): ByoPresetDefinition | undefined {
    return this.presets.find((p) => p.id === this.presetId);
  }

  get baseUrl(): string {
    return this.entries[this.presetId]?.baseUrl ?? this.preset?.baseUrl ?? '';
  }

  get model(): string {
    return this.entries[this.presetId]?.model ?? this.preset?.model ?? '';
  }

  get key(): string {
    return this.keys[this.presetId] ?? '';
  }

  /** Address valid, model named, and a key where the preset needs one. */
  get complete(): boolean {
    return (
      !!normalizeBaseUrl(this.baseUrl) &&
      !!this.model.trim() &&
      (!!this.preset?.keyless || !!this.key.trim())
    );
  }

  select(id: string): void {
    if (!this.presets.some((p) => p.id === id)) return;
    this.presetId = id;
    this.resetTest();
    this.save();
  }

  setBaseUrl(baseUrl: string): void {
    this.entries = {
      ...this.entries,
      [this.presetId]: { baseUrl, model: this.model },
    };
    this.edited();
  }

  setModel(model: string): void {
    this.entries = {
      ...this.entries,
      [this.presetId]: { baseUrl: this.baseUrl, model },
    };
    this.edited();
  }

  setKey(key: string): void {
    this.keys = { ...this.keys, [this.presetId]: key.trim() };
    this.edited();
  }

  /** Remove the saved key for the selected preset. */
  forgetKey(): void {
    const { [this.presetId]: _gone, ...rest } = this.keys;
    this.keys = rest;
    this.edited();
  }

  /** The chat model for what is entered, or null while it is incomplete. */
  chat(): ChatModel | null {
    if (!this.complete) return null;
    const baseUrl = normalizeBaseUrl(this.baseUrl);
    if (!baseUrl) return null;
    return createOpenAIChat({
      baseUrl,
      model: this.model.trim(),
      apiKey: this.preset?.keyless ? undefined : this.key,
      fetch: this.options.fetch,
    });
  }

  async test(): Promise<ConnectionResult> {
    const baseUrl = normalizeBaseUrl(this.baseUrl);
    if (!baseUrl || !this.model.trim()) {
      this.testStatus = 'failed';
      this.testMessage = 'Enter an http(s) address and a model first.';
      return { ok: false, message: this.testMessage };
    }
    if (!this.preset?.keyless && !this.key.trim()) {
      this.testStatus = 'failed';
      this.testMessage = 'Enter a key first.';
      return { ok: false, message: this.testMessage };
    }
    this.testStatus = 'testing';
    this.testMessage = '';
    const result = await testConnection({
      baseUrl,
      model: this.model.trim(),
      apiKey: this.preset?.keyless ? undefined : this.key,
      fetch: this.options.fetch,
    });
    this.testStatus = result.ok ? 'ok' : 'failed';
    this.testMessage = result.message;
    return result;
  }

  /** Make the assistant use this endpoint. */
  use(): boolean {
    if (!this.complete) return false;
    this.active = true;
    this.save();
    this.options.onChange?.();
    return true;
  }

  /** Stop using it; the entered values stay. */
  stop(): void {
    this.active = false;
    this.save();
    this.options.onChange?.();
  }

  private resetTest(): void {
    this.testStatus = 'idle';
    this.testMessage = '';
  }

  /** An edit invalidates the last test and, if in use, what is in use. */
  private edited(): void {
    this.resetTest();
    const wasActive = this.active;
    if (wasActive && !this.complete) this.active = false;
    this.save();
    if (wasActive) this.options.onChange?.();
  }

  private save(): void {
    try {
      const prefs: ByoPrefs = {
        preset: this.presetId,
        active: this.active,
        entries: { ...this.entries },
      };
      this.options.storage?.setItem(BYO_PREFS_KEY, JSON.stringify(prefs));
      this.options.storage?.setItem(BYO_KEYS_KEY, JSON.stringify(this.keys));
    } catch {
      // Not saved; the choice still holds for this visit.
    }
  }
}

/**
 * The chat model for the endpoint a visitor already connected in this browser
 * (a mounted `Planner` in byo mode has no AI page of its own). Null when none
 * is connected or what was saved is incomplete.
 */
export function savedByoChat(
  storage: Storage | null,
  presets?: readonly (string | ByoPresetDefinition)[],
  fetcher?: typeof fetch,
): ChatModel | null {
  const prefs = loadByoPrefs(storage);
  if (!prefs.active) return null;
  const preset = resolvePresets(presets).find((p) => p.id === prefs.preset);
  const entry = prefs.entries[prefs.preset];
  const baseUrl = normalizeBaseUrl(entry?.baseUrl ?? preset?.baseUrl ?? '');
  const model = (entry?.model ?? preset?.model ?? '').trim();
  const key = loadByoKeys(storage)[prefs.preset] ?? '';
  if (!preset || !baseUrl || !model || (!preset.keyless && !key)) return null;
  return createOpenAIChat({
    baseUrl,
    model,
    apiKey: preset.keyless ? undefined : key,
    fetch: fetcher,
  });
}
