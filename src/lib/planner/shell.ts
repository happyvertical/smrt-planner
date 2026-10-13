import type { AppShell, DockToggle } from '@happyvertical/smrt-svelte/app';
import type {
  PanelEdge,
  ShellPanelDefaults,
} from '@happyvertical/smrt-svelte/workspace';
import type { ComponentProps } from 'svelte';

/**
 * The Planner starts with its navigation open so footer controls stay in the
 * left sidebar. Hosts embedding Planner can use the same shell defaults.
 */
export const PLANNER_SHELL_EDGE_TOGGLES: Partial<Record<PanelEdge, boolean>> = {
  left: true,
};

/** Panel defaults shared by Planner's static shell and embedding hosts. */
export const PLANNER_SHELL_PANEL_DEFAULTS: ShellPanelDefaults = {
  left: { initial: 'expanded' },
  right: { initial: 'collapsed', rail: false, presentation: 'overlay' },
  bottom: { initial: 'hidden' },
};

/**
 * The shell's assistant control: the built-in `dock:assistant` item (a
 * chat-bubble `header.end` button, the dock tab on phones) toggling the
 * `assistant` `ShellDockTool`. Before a model is ready the dock itself shows
 * the setup (`BrowserAssistant`): the shell's dock toggle has no "navigate
 * instead" hook, so the setup comes to the visitor rather than the reverse.
 */
export const PLANNER_ASSISTANT_TOGGLE: DockToggle = {
  tool: 'assistant',
  label: 'Assistant',
};

type ShellUser = NonNullable<ComponentProps<typeof AppShell>['user']>;

/**
 * The visitor, as the shell's account item (`item:account`: full identity in
 * the expanded sidebar footer, the compact avatar in the collapsed rail and on
 * phones). A static demo has no sign-in, so this stands in for one.
 */
export const PLANNER_SHELL_USER: ShellUser = {
  id: 'visitor',
  slug: null,
  created_at: null,
  updated_at: null,
  profileId: 'visitor',
  email: '',
  status: 'active',
  lastLoginAt: null,
  name: 'You',
} as ShellUser;

/** Props for an AppShell that hosts Planner. */
export function plannerShellProps() {
  return {
    edgeToggles: PLANNER_SHELL_EDGE_TOGGLES,
    config: PLANNER_SHELL_PANEL_DEFAULTS,
    hotkeys: false,
    user: PLANNER_SHELL_USER,
    phoneTabBar: true,
    phoneDock: 'sheet' as const,
  };
}
