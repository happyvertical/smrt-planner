import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import {
  appHref,
  getBasePath,
  setBasePath,
} from '../src/lib/planner/app.svelte.ts';
import { PLANNER_TAB_IDS } from '../src/lib/planner/commands/index.ts';
import Planner from '../src/lib/planner/Planner.svelte';
import PlannerControls from '../src/lib/planner/PlannerControls.svelte';
import { plannerTab } from '../src/lib/planner/tab.svelte.ts';

describe('Planner component', () => {
  it('renders the app shell and its customization controls without a host router', () => {
    const { body } = render(Planner, { props: { basePath: '/planner' } });
    expect(body).toContain('smrt-admin-shell');
    for (const label of [
      'Cookbooks',
      'Recipes',
      'Theme',
      'Settings',
      'Export',
    ]) {
      expect(body, label).toContain(label);
    }
    expect(PLANNER_TAB_IDS).toHaveLength(7);
  });

  it('shows a host back link at the start of its header only when given one', () => {
    const plain = render(Planner, { props: { basePath: '/planner' } }).body;
    expect(plain).not.toContain('data-planner-back');
    const { body } = render(Planner, {
      props: {
        basePath: '/planner',
        backLink: { href: '/docs', label: 'Back to documentation' },
      },
    });
    expect(body).toContain('data-planner-back');
    expect(body).toContain('href="/docs"');
    expect(body).toContain('Back to documentation');
  });

  it('has an assistant toggle and dock only when the host gives it a model', () => {
    const plain = render(Planner, { props: { basePath: '/planner' } }).body;
    expect(plain).not.toContain('data-dock-tool="assistant"');
    const { body } = render(Planner, {
      props: { basePath: '/planner', inference: { mode: 'byo' } },
    });
    // The shell's own `dock:assistant` button; the dock it opens shows the
    // setup until a model is ready (there is no planner-side toggle any more).
    expect(body).toContain('data-dock-tool="assistant"');
    expect(body).toContain('aria-label="Assistant"');
    expect(body).not.toContain('data-assistant-setup');
  });

  it('renders the shell account item for the visitor', () => {
    const { body } = render(Planner, { props: { basePath: '/planner' } });
    expect(body).not.toContain('User menu');
    expect(body).toContain('>You<');
  });

  it('builds its links from basePath, not from SvelteKit', () => {
    setBasePath('/kitchen/');
    expect(getBasePath()).toBe('/kitchen');
    expect(appHref('/recipes/sales/')).toBe('/kitchen/recipes/sales/');
    setBasePath('');
    expect(appHref('/ai/')).toBe('/ai/');
  });

  it('keeps Features and Layout reachable after they left the tab strip', () => {
    try {
      plannerTab.active = 'features';
      const { body } = render(PlannerControls, { props: {} });
      expect(body).toContain('Show all');
      expect(body).not.toMatch(/role="tab"[^>]*>\s*Features/);
    } finally {
      plannerTab.active = 'cookbooks';
    }
  });

  it('offers the controls separately for hosts with their own shell', () => {
    const { body } = render(PlannerControls, {
      props: { tabs: ['recipes', 'export'] },
    });
    expect(body).not.toContain('smrt-admin-shell');
    expect(body).toContain('Recipes');
    expect(body).toContain('Export');
    expect(body).not.toContain('Cookbooks');
  });
});
