/**
 * The built-in smrt-ui theme presets, in smrt-ui's order. Kept as a plain list
 * because `@happyvertical/smrt-ui/themes` has no entry plain Node can import
 * (its index pulls in `.svelte` components), and `./core` must run in Node.
 * `tests/theme-presets.test.ts` fails when this drifts from smrt-ui.
 */
export const BUILT_IN_THEME_PRESETS: readonly string[] = [
  'material',
  'glass',
  'studio',
  'smrt',
  'happyvertical',
];
