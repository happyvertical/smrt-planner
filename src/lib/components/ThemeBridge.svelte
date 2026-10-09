<script lang="ts">
import {
  getThemeContext,
  type ThemePreset,
} from '@happyvertical/smrt-ui/themes';
import { blueprintStore } from '$lib/blueprint/store.svelte.ts';
import { resolveTheme } from '$lib/theme/runtime.ts';
import type { ColorSchemeSetting } from '$lib/theme/theme.ts';

// The app document owns the theme. This applies it to the shell's
// ThemeProvider once the saved document is read, and reads back a change made
// through the provider's own controls (ThemeSwitcher, ColorSchemeToggle) so
// that it is saved with the document.
const context = getThemeContext();

// What this bridge last told the provider, to tell its own writes from a
// person's. Null until the document has been applied once.
let applied: { preset: string; colorScheme: ColorSchemeSetting } | null = null;

// Document -> provider.
$effect(() => {
  if (!blueprintStore.loaded) return;
  const wanted = resolveTheme(blueprintStore.theme);
  if (
    applied?.preset === wanted.preset &&
    applied.colorScheme === wanted.colorScheme
  ) {
    return;
  }
  applied = wanted;
  if (context.state.preset !== wanted.preset)
    context.setPreset(wanted.preset as ThemePreset);
  if (context.state.colorScheme !== wanted.colorScheme) {
    context.setColorScheme(wanted.colorScheme);
  }
});

// Provider -> document.
$effect(() => {
  const { preset, colorScheme } = context.state;
  if (!applied || !blueprintStore.loaded) return;
  const before = applied;
  if (preset !== before.preset) {
    applied = { ...before, preset };
    blueprintStore.setTheme({
      ...blueprintStore.theme,
      preset,
      custom: undefined,
    });
  }
  if (colorScheme !== before.colorScheme) {
    applied = { ...(applied ?? before), colorScheme };
    blueprintStore.setTheme({ ...blueprintStore.theme, colorScheme });
  }
});
</script>
