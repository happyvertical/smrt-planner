/**
 * The kitchen token arrives in the address, never in a file the server serves.
 * `smrt kitchen` opens `http://127.0.0.1:<port>/#kitchen=<token>`: a fragment is
 * never sent to a server, so no endpoint (and no other local process sending
 * the right `Host`) can read it from `planner.config.json`. The page reads the
 * fragment once at startup, keeps the token in memory only, and removes the
 * `kitchen` parameter from the address (`replaceState`) so it is not left in
 * the history entry either.
 */

/** The fragment key the token is under. */
export const KITCHEN_FRAGMENT_KEY = 'kitchen';

/** URL-safe characters only (RFC 3986 unreserved): what `base64url` and hex produce. */
const TOKEN = /^[A-Za-z0-9._~-]{1,256}$/;

export interface KitchenFragment {
  /** The token, when the fragment carried a usable one. */
  token?: string;
  /** True when the fragment had a `kitchen` parameter (usable or not) to strip. */
  present: boolean;
  /**
   * The fragment without the `kitchen` parameter, as it belongs in the address:
   * `''` or `#other=1`. Other parameters are kept.
   */
  hash: string;
}

/** Read `location.hash` (with or without the `#`). Never throws. */
export function readKitchenFragment(hash: string): KitchenFragment {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!text) return { present: false, hash: '' };
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(text);
  } catch {
    return { present: false, hash: hash.startsWith('#') ? hash : `#${hash}` };
  }
  if (!params.has(KITCHEN_FRAGMENT_KEY)) {
    return { present: false, hash: `#${text}` };
  }
  const given = params.get(KITCHEN_FRAGMENT_KEY) ?? '';
  params.delete(KITCHEN_FRAGMENT_KEY);
  const rest = params.toString();
  return {
    ...(TOKEN.test(given) ? { token: given } : {}),
    present: true,
    hash: rest ? `#${rest}` : '',
  };
}
