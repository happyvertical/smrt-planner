import { describe, expect, it } from 'vitest';
import {
  approveCustomCss,
  containCustomCss,
  cssFingerprint,
  customCssApproved,
  customCssDisabled,
} from '../src/lib/theme/custom-css.svelte.ts';

describe('untrusted cookbook CSS', () => {
  it('applies only CSS the visitor approved, exactly as approved', () => {
    const css = '.smrt-admin-shell { color: red; }';
    expect(customCssApproved(css)).toBe(false);
    approveCustomCss(css);
    expect(customCssApproved(css)).toBe(true);
    expect(customCssApproved(`${css} `)).toBe(false);
    expect(cssFingerprint(css)).not.toContain('color');
  });

  it('turns custom CSS off from the address bar', () => {
    expect(customCssDisabled('?styles=off')).toBe(true);
    expect(customCssDisabled('?packages=a&styles=off')).toBe(true);
    expect(customCssDisabled('?styles=on')).toBe(false);
    expect(customCssDisabled('')).toBe(false);
  });

  it('applies nothing where the browser cannot parse CSS', () => {
    expect(containCustomCss('body { display: none }')).toBe('');
  });
});
