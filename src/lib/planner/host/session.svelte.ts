import type { PlanSnapshot } from '@happyvertical/smrt-core/cookbook/engine';
import { untrack } from 'svelte';
import type { Cookbook } from '../../cookbook/types.ts';
import { cookbookStore } from '../../cookbook/store.svelte.ts';
import { parseCookbook } from '../../cookbook/validate.ts';

export interface HostPlan { planId: string; snapshot: PlanSnapshot; cookbook: Cookbook }
export type CallKitchenTool = (name: string, args: Record<string, unknown>) => Promise<unknown>;
let mounted = false;

/** One authoritative Kitchen plan projected into the stores the existing panels read. */
export function createHostSession(callTool: CallKitchenTool) {
  let current = $state.raw<HostPlan | null>(null);
  let busy = $state(false);
  let error = $state('');
  let draft = $state.raw<Cookbook | null>(null);
  let pending: Record<string, unknown> | null = null;
  let baseline = '';
  let disposed = false;
  const copy = (value: Cookbook): Cookbook => JSON.parse(JSON.stringify(value));
  function refresh(value: unknown) {
    const payload = value as { planId: string; state: Omit<HostPlan, 'planId'> };
    const next = payload?.state ? { planId: payload.planId, ...payload.state } : value as HostPlan;
    if (!next || typeof next.planId !== 'string' || !Number.isInteger(next.snapshot?.revision)) throw new Error('Kitchen did not return a plan snapshot.');
    if (current && next.planId !== current.planId) throw new Error('Kitchen returned a different plan.');
    const parsed = parseCookbook(next.cookbook);
    if (!parsed.ok) throw new Error(parsed.error);
    if (current && next.snapshot.revision < current.snapshot.revision) return;
    if (current && JSON.stringify(cookbookStore.snapshot()) !== baseline) {
      draft = copy(cookbookStore.snapshot());
      error = 'Kitchen updated the plan while you were editing. Your draft is preserved.';
    }
    current = { ...next, cookbook: copy(parsed.cookbook) };
    cookbookStore.apply(current.cookbook);
    cookbookStore.loaded = true;
    baseline = JSON.stringify(cookbookStore.snapshot());
  }
  async function invoke() {
    if (!pending || busy || disposed) return;
    busy = true; error = '';
    const submitted = draft;
    try {
      const result = (await callTool('run_commands', pending)) as HostPlan & { state?: unknown } & { ok: boolean; error?: { message?: string } };
      if (disposed) return;
      if (result?.state || (result?.snapshot && result?.cookbook)) refresh(result);
      if (!result?.ok) {
        pending = null;
        throw new Error(result?.error?.message ?? 'Kitchen rejected this edit. Your draft is preserved below.');
      }
      pending = null; if (draft === submitted) draft = null;
    } catch (cause) {
      if (!disposed) error = cause instanceof Error ? cause.message : String(cause);
    } finally { busy = false; }
  }
  return {
    get current() { return current; }, get busy() { return busy; }, get error() { return error; }, get draft() { return draft; },
    get retryable() { return pending !== null; },
    refresh,
    async connect(planId: string) {
      try { refresh(await callTool('get_plan', { planId })); }
      catch (cause) { error = String(cause); }
    },
    retry: invoke,
    mount() {
      if (mounted) throw new Error('Only one host-backed Planner may be mounted in this document.');
      mounted = true;
      const stop = $effect.root(() => {
        $effect(() => {
          const value = JSON.stringify(cookbookStore.snapshot());
          untrack(() => {
            if (!current || value === baseline || disposed) return;
            draft = JSON.parse(value);
            cookbookStore.apply(current.cookbook);
            baseline = JSON.stringify(cookbookStore.snapshot());
            if (busy || pending) { error = 'An edit is already pending. Your additional draft is preserved.'; return; }
            pending = { planId: current.planId, id: crypto.randomUUID(), expectedRevision: current.snapshot.revision, commands: [{ name: 'import_cookbook', input: { document: draft, replace: true } }] };
            void invoke();
          });
        });
      });
      return () => { disposed = true; stop(); mounted = false; };
    },
  };
}
export type HostSession = ReturnType<typeof createHostSession>;
