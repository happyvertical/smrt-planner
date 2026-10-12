/**
 * Run a DOM update inside a View Transition when the browser offers one and
 * the visitor has not asked for reduced motion; otherwise just run the update.
 *
 * `@happyvertical/smrt-svelte/app` will export an equivalent helper
 * (happyvertical/smrt#3858, the app-layout + motion epic #3850). When the
 * planner bumps to that release this module becomes a one-line re-export:
 *
 *   export { runViewTransition } from '@happyvertical/smrt-svelte/app';
 *
 * Until then every planner-side caller imports from here, so the swap touches
 * nothing else.
 */

export interface ViewTransitionOptions {
  /** Run `update` directly, with no transition (for the first paint, say). */
  skip?: boolean;
}

type StartViewTransition = (update: () => void | Promise<void>) => {
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  finished: Promise<void>;
};

function startViewTransition(): StartViewTransition | undefined {
  if (typeof document === 'undefined') return undefined;
  const start = (document as Document & { startViewTransition?: unknown })
    .startViewTransition;
  return typeof start === 'function'
    ? (start as StartViewTransition).bind(document)
    : undefined;
}

/** True when the visitor's OS or browser asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Resolves once the DOM update is done (`updateCallbackDone`), not once the
 * animation has finished, so callers never wait on the crossfade. A transition
 * the browser skips or aborts (a duplicate `view-transition-name`, a second
 * transition starting) still resolves: the update itself has run either way.
 */
export async function runViewTransition(
  update: () => void | Promise<void>,
  options: ViewTransitionOptions = {},
): Promise<void> {
  const start = startViewTransition();
  if (options.skip || !start || prefersReducedMotion()) {
    await update();
    return;
  }
  const transition = start(update);
  // `ready` and `finished` reject when the transition is skipped (another
  // one started, a duplicate `view-transition-name`); the update still ran,
  // so neither rejection is anybody's business here.
  transition.ready.catch(() => {});
  transition.finished.catch(() => {});
  await transition.updateCallbackDone;
}
