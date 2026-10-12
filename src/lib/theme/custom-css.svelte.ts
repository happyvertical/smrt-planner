/**
 * Custom CSS from a cookbook is untrusted: a cookbook can be imported, shared,
 * or written by a host agent. Before it reaches the page it is parsed by the
 * browser, stripped of external loads, and re-serialized inside an `@scope`
 * rooted at the app shell, so it can neither style the host page nor fetch
 * anything. It applies only once the visitor approves that exact text.
 */

/** The element custom CSS may style: the app shell and its contents. */
export const CUSTOM_CSS_SCOPE = '.smrt-admin-shell';
/** `?styles=off` turns custom CSS off, whatever it hides. */
export const STYLES_OFF_PARAM = 'styles';
const APPROVED_KEY = 'smrt-planner-approved-css';
const MAX_APPROVED = 20;

/** Property values that would load something: allowed only as `data:` URLs. */
const LOADS = /\b(?:url|image-set|image|cross-fade|element|src)\s*\(/i;

function onlyDataUrls(value: string): boolean {
  if (!LOADS.test(value)) return true;
  const calls = value.match(/\b[a-z-]+\s*\(/gi) ?? [];
  if (calls.some((call) => !/^url\s*\(/i.test(call) && LOADS.test(call)))
    return false;
  const urls = [...value.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)];
  return (
    urls.length > 0 && urls.every(([, , target]) => /^data:/i.test(target))
  );
}

/** Split a selector list on its top-level commas. */
function selectorList(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out;
}

const LEADING_SCOPE = new RegExp(
  `^${CUSTOM_CSS_SCOPE.replace('.', '\\.')}(?![\\w-])`,
);

/**
 * Inside `@scope`, a selector without `:scope` is read as a descendant of the
 * root, so `.smrt-admin-shell a` would never match. A leading root selector
 * becomes `:scope`; the scope limit still keeps every match inside the shell.
 */
function rootToScope(rule: CSSStyleRule): void {
  const next = selectorList(rule.selectorText)
    .map((selector) => selector.replace(LEADING_SCOPE, ':scope'))
    .join(', ');
  if (next !== rule.selectorText) rule.selectorText = next;
}

/** Drop declarations that load anything but `data:` URLs, at every depth. */
function stripLoads(rules: CSSRuleList, nestedInStyle = false): void {
  for (const rule of Array.from(rules)) {
    if (!nestedInStyle && 'selectorText' in rule)
      rootToScope(rule as CSSStyleRule);
    const style = (rule as Partial<CSSStyleRule>).style;
    if (style) {
      for (const property of Array.from(style)) {
        if (!onlyDataUrls(style.getPropertyValue(property)))
          style.removeProperty(property);
      }
    }
    const nested = (rule as Partial<CSSGroupingRule>).cssRules;
    if (nested) stripLoads(nested, nestedInStyle || 'selectorText' in rule);
  }
}

const isImport = (rule: CSSRule) =>
  (typeof CSSImportRule !== 'undefined' && rule instanceof CSSImportRule) ||
  (typeof CSSNamespaceRule !== 'undefined' && rule instanceof CSSNamespaceRule);

/**
 * The browser's own reading of `css`, without external loads, scoped to the
 * app shell. Serialized rules are balanced, so nothing can close the scope.
 * Empty outside a browser or when nothing survives.
 */
export function containCustomCss(css: string): string {
  if (!css.trim() || typeof CSSStyleSheet === 'undefined') return '';
  const sheet = new CSSStyleSheet();
  try {
    sheet.replaceSync(css);
  } catch {
    return '';
  }
  stripLoads(sheet.cssRules);
  const rules = Array.from(sheet.cssRules)
    .filter((rule) => !isImport(rule))
    .map((rule) => rule.cssText);
  return rules.length
    ? `@scope (${CUSTOM_CSS_SCOPE}) {\n${rules.join('\n')}\n}`
    : '';
}

/** A short stable fingerprint, so approvals do not store the CSS itself. */
export function cssFingerprint(css: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < css.length; i++) {
    hash ^= css.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${css.length}:${(hash >>> 0).toString(36)}`;
}

function readApproved(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(APPROVED_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((v) => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Whether this visitor approved exactly this CSS on this device. */
export function isCustomCssApproved(css: string): boolean {
  return readApproved().includes(cssFingerprint(css));
}

/** Remember the visitor's approval of exactly this CSS. */
export function approveCustomCss(css: string): void {
  const id = cssFingerprint(css);
  const next = [id, ...readApproved().filter((v) => v !== id)].slice(
    0,
    MAX_APPROVED,
  );
  try {
    localStorage.setItem(APPROVED_KEY, JSON.stringify(next));
  } catch {
    // Without storage the approval lasts for this page only.
  }
  approvedThisPage.add(id);
  approvals.version++;
}

const approvedThisPage = new Set<string>();
// Bumped on each approval so readers re-run.
const approvals = $state({ version: 0 });

/** Approved here or remembered on this device; reactive to new approvals. */
export function customCssApproved(css: string): boolean {
  void approvals.version;
  return approvedThisPage.has(cssFingerprint(css)) || isCustomCssApproved(css);
}

/** `?styles=off` in the address bar. */
export function customCssDisabled(search: string): boolean {
  return new URLSearchParams(search).get(STYLES_OFF_PARAM) === 'off';
}
