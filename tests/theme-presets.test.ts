import { availablePresets } from '@happyvertical/smrt-ui/themes';
import { expect, it } from 'vitest';
import { BUILT_IN_THEME_PRESETS } from '../src/lib/theme/presets.ts';

it('lists exactly the presets smrt-ui ships', () => {
  expect([...BUILT_IN_THEME_PRESETS]).toEqual([...availablePresets]);
});
