# Inference modes and the host wire contract

The planner's assistant needs a language model. Where it runs is chosen at
runtime, so one build serves every deployment.

## Config: `planner.config.json`

Served at `${base}/planner.config.json` (next to the app; `base` is the
SvelteKit base path) and fetched once at startup. A missing file means the
defaults. A mounted `Planner` can pass the same object as its `inference` prop
(plus `onReply`); the prop overrides the file.

```json
{
  "inference": {
    "mode": "browser | host | byo",
    "host": { "endpoint": "/api/planner/chat" },
    "byo": { "presets": ["ollama", "openrouter", "openai", "custom"] }
  }
}
```

- `mode` defaults to `browser`.
- `host.endpoint` is required for `host`: an `http(s)://` URL, or a path on the
  page's own origin. A cross-origin endpoint must answer CORS (see below).
- `byo.presets` is optional. Entries are built-in ids (`ollama`, `openrouter`,
  `openai`, `custom`) or full definitions
  `{ id, label, baseUrl, model?, keyless?, cors? }`. Default: all four.
- Anything invalid (bad JSON, unknown mode, `host` without a usable endpoint,
  malformed presets) falls back to `browser` and shows a visible notice on the
  AI page. A 404 or an HTML fallback page is "no file", with no notice.

| Mode | Where the model runs | Setup | Hear / Speak |
| --- | --- | --- | --- |
| `browser` | WebLLM in a worker (WebGPU) | download on the AI page | in browser |
| `host` | the host's server | none | in browser |
| `byo` | the visitor's OpenAI-compatible endpoint | AI page: preset, model, key, Test connection | in browser |

The Think indicator reads "In browser", "Server" or "Your model: <name>".

## Host mode wire contract (version 1)

The server owns the prompt. The client never sends the planner's system prompt
or response schema.

### Request

`POST <endpoint>`, `content-type: application/json`, `accept: application/json`.
Same-origin cookies are sent (the fetch default); the planner adds no
Authorization header.

```json
{
  "version": 1,
  "message": "I run a bakery",
  "snapshot": { "version": 1, "revision": 4, "recipes": [], "...": "..." },
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

- `message`: the visitor's text, at most 2000 characters.
- `snapshot`: the controller's compact `PlanSnapshot` (`./commands`, about 2.6
  to 4.8 KB): recipes, features, settings, theme, sections, focus, undo.
- `history`: optional, oldest first, at most 6 entries of at most 1000
  characters, roles `user` and `assistant` only (never `system`).
- The client gives up after 60 s. Cancelling a turn aborts the request.

### Response

`200` with a JSON object, the same turn shape the assistant reads from a model.
Every field but `reply` is optional:

```json
{
  "reply": "Added Sales and Invoicing.",
  "add": ["commerce.sales"],
  "remove": [],
  "settings": { "currency": "CAD", "taxRate": 13, "paymentTerms": "Net 30" },
  "theme": { "preset": "glass", "primary": "#00aa77", "colorScheme": "dark" },
  "commands": [
    { "name": "add_recipes", "input": { "ids": ["commerce.sales"] } }
  ]
}
```

- `reply`: the sentence shown (and read aloud when Speak is on), about 200
  characters at most.
- `add` / `remove`: recipe ids; unknown ids are dropped client-side.
- `settings.taxRate` is in percent. `theme` is tokens only, never CSS.
- `commands`: up to 8 planner commands (`commandTools` / `commandSchemas` in
  `./commands`), run in order through the controller, which validates each.
  The first refused one stops the rest and is reported in the chat. They apply
  only in host mode; a browser or bring-your-own model's `commands` are ignored.
- A non-JSON body is shown as the reply text. A non-2xx status shows "the model
  could not answer: the server answered <status>".
- Streaming is not part of version 1. A later version may add
  `accept: text/event-stream` with the same object as the final event; a server
  that ignores it and answers JSON stays valid.

CORS, for a cross-origin endpoint: allow the page's origin, methods `POST` and
`OPTIONS`, and header `content-type`.

### Stub

`tests/inference-host.test.ts` runs the client against a real HTTP stub server
(`tests/stub-server.ts`); copy it as a conformance starting point.

## Bring-your-own mode

The AI page offers Ollama (`http://localhost:11434/v1`), OpenRouter, OpenAI and
a custom OpenAI-compatible address. Each has a model field and, except Ollama,
a key field, plus **Test connection** (one tiny completion that exercises the
address, the model and the key).

- The key is stored only in this browser: `localStorage` key
  `smrt-planner:inference-key:v1`, apart from the choices in
  `smrt-planner:inference:v1`. It is sent only as `Authorization: Bearer <key>`
  to the chosen address, never in a URL, a body, a message or a log.
- The client builds the planner prompt itself (as in browser mode) and POSTs
  `${baseUrl}/chat/completions` with `response_format` JSON mode: the planner's
  `json_schema`, stepping down to `json_object` and then plain text when the
  endpoint answers 400 or 422.
- Browser access (CORS) per preset:
  - **Ollama**: start it with `OLLAMA_ORIGINS` set to the site's origin (for
    example `OLLAMA_ORIGINS=https://example.com ollama serve`; on macOS
    `launchctl setenv OLLAMA_ORIGINS https://example.com`, then restart).
  - **OpenRouter** and **OpenAI**: calls from web pages are accepted. Use a
    key with a low spending limit; anyone with access to the browser profile
    can read it.
  - **Custom**: answer the preflight for the page's origin, headers
    `authorization` and `content-type`, methods `POST` and `OPTIONS`.
- `@happyvertical/ai` was checked first: its root entry wraps the Node-first
  `openai`, Anthropic and AWS SDKs, and its browser-safe `./local` entry only
  has the WebLLM provider, so the client is a single `fetch`
  (`src/lib/inference/openai.ts`).

## Implementing the host in Node: `smrt-planner/core`

`./commands` is Svelte source and cannot be imported by plain Node. `./core` is
the rune-free part, compiled to plain JavaScript, with no Vite and no Svelte
compiler involved. It has everything a server needs to speak this contract:

| Export | Use |
| --- | --- |
| `parseHostRequest(body)` | check the POST body: `{ ok, request }` or `{ ok: false, error }` |
| `buildHostPrompt({ message, snapshot, history?, catalog? })` | `{ system, messages }` for one chat call |
| `replySchema` / `buildReplySchema(catalog?)` | JSON Schema of the model's answer (ids are enums) |
| `parseHostReply(text, catalog?)` | `{ ok, reply, issues }`; `reply` is the response body |
| `commandTools`, `commandSchemas`, `checkSchema` | the 19 commands as tool definitions |
| `recipes`, `libraryCookbooks`, `defaultCatalog` | the catalog the prompt is built from |
| `PlanSnapshot`, `CommandInputs`, `HostRequest`, `HostReply` ... | types |

`buildHostPrompt` is the browser assistant's own prompt (same wording and worked
examples, focused on the recipes the message matches, with the snapshot's
settings, theme and recipes) plus a host-only section naming the `commands` and
the menu ids. `system` is separate, so it fits both API styles: OpenAI-style,
send `[{ role: 'system', content: system }, ...messages]`; Anthropic-style, pass
`system` and `messages` as they are.

### Minimal reference server

Any OpenAI-compatible endpoint works (`BASE_URL` such as
`http://localhost:11434/v1` for Ollama, `MODEL` its model name):

```js
import { createServer } from 'node:http';
import { buildHostPrompt, parseHostReply, parseHostRequest, replySchema }
  from 'smrt-planner/core';

const { BASE_URL, MODEL, API_KEY = '' } = process.env;

async function chat(req) {
  const { system, messages } = buildHostPrompt(req);
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [{ role: 'system', content: system }, ...messages],
      response_format: { type: 'json_schema', json_schema: { name: 'turn', schema: replySchema } },
    }),
  });
  if (!res.ok) throw new Error(`model answered ${res.status}`);
  return (await res.json()).choices[0].message.content;
}

createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/planner/chat') {
    return res.writeHead(404).end();
  }
  let body = '';
  for await (const part of req) body += part;
  let parsed;
  try { parsed = parseHostRequest(JSON.parse(body)); } catch { parsed = { ok: false, error: 'bad JSON' }; }
  if (!parsed.ok) return res.writeHead(400).end(parsed.error);
  try {
    const { reply, issues } = parseHostReply(await chat(parsed.request));
    if (issues.length) console.warn('planner reply:', issues);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(reply));
  } catch (error) {
    console.error(error);
    res.writeHead(502).end();
  }
}).listen(8787);
```

A model without `json_schema` support: drop `response_format` or use
`{ type: 'json_object' }`; `parseHostReply` still repairs prose, cut-off JSON
and unknown ids.

### Serving the planner app: `smrt-planner/app`

`pnpm package` also builds the prerendered static app into the package's
`app/` directory. `appDir` from `smrt-planner/app` is its absolute path (Node
only; `appFile('x')` resolves one file in it). The files are also addressable as
`smrt-planner/app/*`.

```js
import { appDir } from 'smrt-planner/app';
// serve appDir at `/` or at `/planner`; for example with sirv, express.static or serve-static
```

- **Base path.** The app is built with SvelteKit's relative paths: every asset
  and link in each prerendered page is relative, and the page works out its base
  from `location` in the browser. The same files serve at `/`, at `/planner/`
  or anywhere else, with no rebuild or setting. Serve `index.html` for
  directories (every route is `<dir>/index.html`, trailing slash always) and
  redirect `/planner` to `/planner/`.
- **`404.html`** is the SPA fallback for paths that were not prerendered; it is
  built for base `/`, so at a sub-path serve it only if you built from source
  with `BASE_PATH=/planner pnpm build`, or answer unknown paths with `404`.
- **Config.** The app fetches `<base>/planner.config.json` at startup. Answer
  that one path yourself (or copy `appDir` to a writable directory and add the
  file) to choose the inference mode:

  ```json
  { "inference": { "mode": "host", "host": { "endpoint": "/api/planner/chat" } } }
  ```

  `endpoint` is a path on the page's own origin, so it is the same whatever the
  base is. Without the file the app runs in `browser` mode.
- The directory is about 70 MB (the on-device model runtime is most of it);
  serve it with compression and long-lived caching for `_app/immutable/`.
