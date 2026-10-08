import { browserStorage } from '../blueprint/storage.ts';

/** Which cookbook the visitor last applied; a UI note, not part of the blueprint. */
export const COOKBOOK_KEY = 'smrt-planner:cookbook';

class CookbookState {
  active = $state<string | null>(null);

  /** Read the remembered cookbook (browser only; never throws). */
  load(storage: Storage | null = browserStorage()): void {
    try {
      this.active = storage?.getItem(COOKBOOK_KEY) ?? null;
    } catch {
      this.active = null;
    }
  }

  select(id: string, storage: Storage | null = browserStorage()): void {
    this.active = id;
    try {
      storage?.setItem(COOKBOOK_KEY, id);
    } catch {
      // Remembered in memory only.
    }
  }
}

export const cookbookState = new CookbookState();
