import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import ExportPanel from '../src/lib/components/ExportPanel.svelte';
import { cookbookStore } from '../src/lib/cookbook/store.svelte.ts';
import { DATA_SOURCE_KEY } from '../src/lib/data/context.ts';
import { parseInferenceConfig } from '../src/lib/inference/config.ts';
import {
  KITCHEN_TOKEN_HEADER,
  parseKitchenConfig,
  sendToKitchen,
} from '../src/lib/kitchen/client.ts';
import { KitchenState, kitchenState } from '../src/lib/kitchen/state.svelte.ts';
import { startStub } from './stub-server.ts';

const kitchen = { endpoint: '/api/kitchen/cookbook', token: 'abc123' };

describe('the kitchen block of planner.config.json', () => {
  it('is read next to the inference block', () => {
    const result = parseInferenceConfig(
      JSON.stringify({
        inference: { mode: 'host', host: { endpoint: '/api/planner/chat' } },
        kitchen,
      }),
    );
    expect(result.config.mode).toBe('host');
    expect(result.kitchen).toEqual(kitchen);
  });

  it('is absent, with no notice, when the file has none', () => {
    const result = parseInferenceConfig(JSON.stringify({}));
    expect(result.kitchen).toBeUndefined();
    expect(result.notice).toBeUndefined();
  });

  it.each([
    ['a missing token', { endpoint: '/x' }],
    ['a blank token', { endpoint: '/x', token: ' ' }],
    ['a missing endpoint', { token: 't' }],
    [
      'a protocol-relative endpoint',
      { endpoint: '//evil.example/x', token: 't' },
    ],
    ['a non-http endpoint', { endpoint: 'ftp://h/x', token: 't' }],
    ['a non-object', 'kitchen'],
  ])('is ignored with %s', (_name, value) => {
    expect(parseKitchenConfig(value)).toBeUndefined();
  });
});

describe('sendToKitchen', () => {
  const cookbook = cookbookStore.snapshot();

  it('POSTs the cookbook with the token and reads the result', async () => {
    const stub = await startStub(() => ({
      body: {
        ok: true,
        dir: '/work/my-app',
        mode: 'new',
        installed: false,
        added: ['@happyvertical/smrt-commerce'],
        nextSteps: ['cd my-app', 'pnpm install'],
      },
    }));
    try {
      const outcome = await sendToKitchen(
        { endpoint: `${stub.origin}/api/kitchen/cookbook`, token: 'tok' },
        cookbook,
      );
      expect(outcome).toEqual({
        ok: true,
        result: {
          dir: '/work/my-app',
          mode: 'new',
          installed: false,
          added: ['@happyvertical/smrt-commerce'],
          nextSteps: ['cd my-app', 'pnpm install'],
        },
      });
      const [request] = stub.requests;
      expect(request.method).toBe('POST');
      expect(request.url).toBe('/api/kitchen/cookbook');
      expect(request.headers[KITCHEN_TOKEN_HEADER]).toBe('tok');
      expect(request.headers['content-type']).toBe('application/json');
      expect(JSON.parse(request.body)).toEqual(cookbook);
    } finally {
      await stub.close();
    }
  });

  it('reports the kitchen refusing the cookbook', async () => {
    const stub = await startStub(() => ({
      status: 422,
      body: { ok: false, errors: ['recipe "x.y" does not exist'] },
    }));
    try {
      const outcome = await sendToKitchen(
        { endpoint: `${stub.origin}/k`, token: 't' },
        cookbook,
      );
      expect(outcome).toEqual({
        ok: false,
        errors: ['recipe "x.y" does not exist'],
      });
    } finally {
      await stub.close();
    }
  });

  it('names the status when the answer is not the contract', async () => {
    const stub = await startStub(() => ({
      status: 500,
      raw: true,
      body: 'boom',
    }));
    try {
      const outcome = await sendToKitchen(
        { endpoint: `${stub.origin}/k`, token: 't' },
        cookbook,
      );
      expect(outcome).toEqual({
        ok: false,
        errors: ['The kitchen answered 500.'],
      });
    } finally {
      await stub.close();
    }
  });

  it('reports an unreachable kitchen instead of throwing', async () => {
    const outcome = await sendToKitchen(kitchen, cookbook, (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errors[0]).toMatch(/smrt kitchen/);
  });
});

describe('KitchenState', () => {
  it('tracks a send from idle to sent, and ignores a send with no kitchen', async () => {
    const state = new KitchenState();
    await state.send(cookbookStore.snapshot());
    expect(state.status).toBe('idle');
    state.configure(kitchen);
    await state.send(
      cookbookStore.snapshot(),
      (async () =>
        new Response(JSON.stringify({ ok: true, dir: '/d', mode: 'update' }), {
          status: 200,
        })) as unknown as typeof fetch,
    );
    expect(state.status).toBe('sent');
    expect(state.outcome?.ok).toBe(true);
    state.configure(undefined);
    expect(state.status).toBe('idle');
    expect(state.outcome).toBeUndefined();
  });
});

// The panel only reads a data source to reset it; any object will do for render.
const context = new Map<unknown, unknown>();
context.set(DATA_SOURCE_KEY, {});

describe('the export panel', () => {
  beforeEach(() => kitchenState.configure(undefined));

  it('offers Export cookbook alone without a kitchen', () => {
    const { body } = render(ExportPanel, { context });
    expect(body).toContain('Export cookbook');
    expect(body).not.toContain('Send to kitchen');
    expect(body).not.toContain('Download cookbook');
  });

  it('puts Send to kitchen first and keeps Download as the secondary option', () => {
    kitchenState.configure(kitchen);
    const { body } = render(ExportPanel, { context });
    expect(body).toContain('Send to kitchen');
    expect(body).toContain('Download cookbook');
    expect(body.indexOf('Send to kitchen')).toBeLessThan(
      body.indexOf('Download cookbook'),
    );
    expect(body).not.toContain('Export cookbook');
  });
});
