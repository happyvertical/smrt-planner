import { describe, expect, it } from 'vitest';
import {
  PLANNER_SHELL_EDGE_TOGGLES,
  PLANNER_SHELL_PANEL_DEFAULTS,
} from '../src/lib/planner/shell.ts';

describe('Planner shell defaults', () => {
  it('starts navigation collapsed with a native left-edge control', () => {
    expect(PLANNER_SHELL_EDGE_TOGGLES).toEqual({ left: true });
    expect(PLANNER_SHELL_PANEL_DEFAULTS.left).toMatchObject({
      initial: 'collapsed',
    });
  });

  it('keeps the assistant dock available through its header toggle', () => {
    expect(PLANNER_SHELL_PANEL_DEFAULTS.right).toMatchObject({
      initial: 'collapsed',
      rail: false,
      presentation: 'overlay',
    });
  });
});
