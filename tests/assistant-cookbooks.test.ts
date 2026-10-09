import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applySettings,
  buildResponseSchema,
  parseChange,
  type SettingsStore,
} from '../src/lib/assistant/change.ts';
import { CookbookOffers } from '../src/lib/assistant/offers.svelte.ts';
import { buildSystemPrompt } from '../src/lib/assistant/prompt.ts';
import {
  type ChatModel,
  createBrowserAssistantTransport,
  GREETING,
} from '../src/lib/assistant/transport.ts';
import { cookbooks, getCookbook } from '../src/lib/cookbooks/index.ts';
import { recipes } from '../src/lib/recipes/index.ts';
import { recipeState } from '../src/lib/recipes/state.svelte.ts';
import {
  type AppSettings,
  DEFAULT_SETTINGS,
} from '../src/lib/settings/app-settings.ts';

beforeEach(() => recipeState.clear());

// Before this change the same prompt (all recipes, one on) was 3077 characters.
const PROMPT_BUDGET = 3600;

describe('prompt', () => {
  it('lists cookbooks and current settings and stays small', () => {
    const prompt = buildSystemPrompt(recipes, ['commerce.sales'], cookbooks, {
      currency: 'CAD',
      taxRate: 0.13,
      paymentTerms: 'Net 30',
    });
    for (const c of cookbooks) {
      expect(prompt).toContain(`- ${c.id}: ${c.name}.`);
    }
    expect(prompt).toContain('Settings: currency CAD, tax 13%, terms Net 30.');
    expect(prompt).toMatch(/12 words or fewer/);
    expect(prompt.length).toBeLessThan(PROMPT_BUDGET);
  });

  it('omits the cookbook and settings sections when there are none', () => {
    const prompt = buildSystemPrompt(recipes, []);
    expect(prompt).not.toContain('Cookbooks:');
    expect(prompt).not.toContain('Settings:');
  });
});

describe('schema and parseChange', () => {
  it('adds optional cookbook and settings', () => {
    const schema = buildResponseSchema(recipes, cookbooks, true) as {
      properties: Record<string, { enum?: unknown[] }>;
      required: string[];
    };
    expect(schema.properties.cookbook.enum).toEqual([
      ...cookbooks.map((c) => c.id),
      null,
    ]);
    expect(schema.properties.settings).toBeDefined();
    expect(schema.required).toEqual(['reply', 'add', 'remove']);
  });

  it('keeps a known cookbook and ignores an invalid id', () => {
    const parse = (cookbook: unknown) =>
      parseChange(JSON.stringify({ reply: 'x', cookbook }), recipes, cookbooks)
        .cookbook;
    expect(parse('bakery')).toBe('bakery');
    expect(parse('nope')).toBeNull();
    expect(parse(3)).toBeNull();
    expect(parse(null)).toBeNull();
  });

  it('validates settings', () => {
    const settings = (value: unknown) =>
      parseChange(JSON.stringify({ reply: '', settings: value }), recipes)
        .settings;
    expect(
      settings({ currency: ' cad ', taxRate: 13, paymentTerms: ' Net 30 ' }),
    ).toEqual({ currency: 'CAD', taxRate: 13, paymentTerms: 'Net 30' });
    expect(settings({ currency: 'XXX' })).toEqual({});
    expect(settings({ currency: 'DEM' })).toEqual({});
    expect(settings({ currency: 'Dollars' })).toEqual({});
    expect(settings({ taxRate: -1 })).toEqual({});
    expect(settings({ taxRate: 101 })).toEqual({});
    expect(settings({ taxRate: '13' })).toEqual({});
    expect(settings({ taxRate: 0 })).toEqual({ taxRate: 0 });
    expect(settings({ paymentTerms: 'x'.repeat(41) })).toEqual({});
    expect(settings({ paymentTerms: '   ' })).toEqual({});
    expect(settings('CAD')).toEqual({});
    expect(settings([1])).toEqual({});
  });
});

function memorySettings(initial: Partial<AppSettings> = {}) {
  let value: AppSettings = { ...DEFAULT_SETTINGS, ...initial };
  const write = vi.fn((next: AppSettings) => {
    value = next;
  });
  const store: SettingsStore = { read: () => value, write };
  return { store, write, get: () => value };
}

describe('applySettings', () => {
  it('writes changes and says so tersely, taxRate as a fraction', () => {
    const memory = memorySettings();
    expect(applySettings(memory.store, { currency: 'CAD', taxRate: 13 })).toBe(
      'Currency CAD, tax 13%.',
    );
    expect(memory.get()).toMatchObject({ currency: 'CAD', taxRate: 0.13 });
    expect(applySettings(memory.store, { paymentTerms: 'Net 30' })).toBe(
      'Terms Net 30.',
    );
  });

  it('writes nothing when nothing changes', () => {
    const memory = memorySettings({ currency: 'CAD' });
    expect(applySettings(memory.store, { currency: 'CAD' })).toBe('');
    expect(applySettings(memory.store, {})).toBe('');
    expect(memory.write).not.toHaveBeenCalled();
  });
});

describe('cookbook offers', () => {
  it('applies only on accept, and the latest offer wins', () => {
    const offers = new CookbookOffers(getCookbook);
    const applier = vi.fn(() => null);
    offers.applier = applier;
    const first = offers.offer('bakery');
    const second = offers.offer('mechanic');
    expect(applier).not.toHaveBeenCalled();
    expect(offers.offers[first?.offerId ?? ''].status).toBe('replaced');
    offers.accept(first?.offerId ?? '');
    expect(applier).not.toHaveBeenCalled();
    offers.accept(second?.offerId ?? '');
    expect(applier).toHaveBeenCalledTimes(1);
    expect(applier).toHaveBeenCalledWith(getCookbook('mechanic'));
    expect(offers.offers[second?.offerId ?? ''].status).toBe('applied');
    // A second click does nothing.
    offers.accept(second?.offerId ?? '');
    expect(applier).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate a pending offer; decline applies nothing', () => {
    const offers = new CookbookOffers(getCookbook);
    const applier = vi.fn(() => null);
    offers.applier = applier;
    const ref = offers.offer('bakery');
    expect(offers.offer('bakery')).toBeNull();
    offers.decline(ref?.offerId ?? '');
    offers.accept(ref?.offerId ?? '');
    expect(applier).not.toHaveBeenCalled();
    expect(offers.offers[ref?.offerId ?? ''].status).toBe('declined');
  });

  it('records a failure', () => {
    const offers = new CookbookOffers(getCookbook);
    offers.applier = () => 'bad blueprint';
    const ref = offers.offer('bakery');
    offers.accept(ref?.offerId ?? '');
    expect(offers.offers[ref?.offerId ?? '']).toMatchObject({
      status: 'failed',
      error: 'bad blueprint',
    });
  });
});

describe('transport', () => {
  function setup(reply: object) {
    const message = vi.fn<ChatModel['message']>(async () =>
      JSON.stringify(reply),
    );
    const offers = new CookbookOffers(getCookbook);
    const applier = vi.fn(() => null);
    offers.applier = applier;
    const memory = memorySettings();
    const transport = createBrowserAssistantTransport({
      model: () => ({ message }),
      store: recipeState,
      recipes,
      cookbooks,
      offers,
      settings: memory.store,
    });
    return { message, offers, applier, memory, transport };
  }
  const send = (t: ReturnType<typeof setup>['transport'], content: string) =>
    t.sendMessage({ threadId: 'planner', content, clientRequestId: content });

  it('opens with one short assistant line', async () => {
    const { transport } = setup({});
    const messages = await transport.loadMessages('planner');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      content: 'What would you like to build?',
    });
    expect(GREETING).toBe('What would you like to build?');
  });

  it('does not send the greeting back to the model', async () => {
    const { message, transport } = setup({ reply: 'ok', add: [], remove: [] });
    await send(transport, 'hi');
    const history = message.mock.calls[0][1]?.history ?? [];
    expect(history.map((m) => m.role)).toEqual(['system']);
    expect(history[0].content).toContain('Cookbooks:');
  });

  it('offers a cookbook without applying it', async () => {
    const { offers, applier, transport } = setup({
      reply: 'A bakery fits.',
      add: [],
      remove: [],
      cookbook: 'bakery',
    });
    const result = await send(transport, 'I run a bakery');
    expect(applier).not.toHaveBeenCalled();
    expect(recipeState.ids).toEqual([]);
    const data = result.assistantMessage?.toolCallData as { offerId: string };
    expect(offers.offers[data.offerId]).toMatchObject({
      cookbookId: 'bakery',
      status: 'pending',
    });
    expect(result.assistantMessage?.content).toBe('A bakery fits.');
    offers.accept(data.offerId);
    expect(applier).toHaveBeenCalledTimes(1);
  });

  it('applies settings directly and summarises them', async () => {
    const { memory, transport } = setup({
      reply: 'Done.',
      add: [],
      remove: [],
      settings: { currency: 'CAD', taxRate: 13 },
    });
    const result = await send(transport, 'we use CAD and 13% tax');
    expect(memory.get()).toMatchObject({ currency: 'CAD', taxRate: 0.13 });
    expect(result.assistantMessage?.content).toBe(
      'Done. Currency CAD, tax 13%.',
    );
  });
});
