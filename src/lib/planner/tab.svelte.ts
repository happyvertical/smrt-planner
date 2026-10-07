import { TAB_PARAM } from './query.ts';

export const PLANNER_TABS = ['recipes', 'layout', 'export'] as const;
export type PlannerTab = (typeof PLANNER_TABS)[number];

/** `recipes` unless the query names another known tab. */
export function parseTab(search: string): PlannerTab {
  const value = new URLSearchParams(search).get(TAB_PARAM);
  return PLANNER_TABS.find((tab) => tab === value) ?? 'recipes';
}

/** The Planner page's active tab; the address bar mirrors it (`?tab=`). */
class PlannerTabState {
  active = $state<PlannerTab>('recipes');

  fromSearch(search: string) {
    this.active = parseTab(search);
  }
}

export const plannerTab = new PlannerTabState();
