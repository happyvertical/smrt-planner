import type { Cookbook } from '../cookbook/types.ts';
import {
  type KitchenConfig,
  type KitchenOutcome,
  sendToKitchen,
} from './client.ts';

export type KitchenStatus = 'idle' | 'sending' | 'sent' | 'failed';

/** Whether a kitchen is listening, and the state of the current send. */
export class KitchenState {
  config = $state<KitchenConfig | undefined>(undefined);
  status = $state<KitchenStatus>('idle');
  outcome = $state<KitchenOutcome | undefined>(undefined);

  configure(config: KitchenConfig | undefined): void {
    this.config = config;
    this.status = 'idle';
    this.outcome = undefined;
  }

  async send(cookbook: Cookbook, fetcher?: typeof fetch): Promise<void> {
    const config = this.config;
    if (!config || this.status === 'sending') return;
    this.status = 'sending';
    this.outcome = undefined;
    const outcome = await sendToKitchen(config, cookbook, fetcher);
    this.outcome = outcome;
    this.status = outcome.ok ? 'sent' : 'failed';
  }
}

/** The app's one kitchen state, set from `planner.config.json`. */
export const kitchenState = new KitchenState();
