# plan.s-m-r-t.dev: the kitchen as a ChatGPT app and a Claude connector

Design for phase 2 of happyvertical/smrt#3751 (epic #3747). Phase 1 shipped the
piece this rests on: `createHeadlessPlanner` in `./core` (see
`docs/inference-host.md`). No server code exists yet.

Research date: 2026-10-10. Every spec claim below names the page it came from;
anything the pages did not state is listed under "Not verified".

## 1. What the platforms require

### Sources fetched

- OpenAI, MCP server: https://developers.openai.com/apps-sdk/build/mcp-server
- OpenAI, UI: https://developers.openai.com/apps-sdk/build/chatgpt-ui
- OpenAI, reference: https://developers.openai.com/apps-sdk/reference
- OpenAI, quickstart: https://developers.openai.com/apps-sdk/quickstart
- OpenAI, auth: https://developers.openai.com/apps-sdk/build/auth
- OpenAI, connect: https://developers.openai.com/apps-sdk/deploy/connect-chatgpt
- OpenAI, submission: https://developers.openai.com/apps-sdk/deploy/submission
- MCP Apps overview: https://modelcontextprotocol.io/extensions/apps/overview
- MCP Apps API/quickstart: https://apps.extensions.modelcontextprotocol.io/api/documents/Quickstart.html
- Claude, build a server: https://claude.com/docs/connectors/building.md
- Claude, MCP Apps: https://claude.com/docs/connectors/building/mcp-apps/getting-started.md
- Claude, connector article (search result summary only; the support.claude.com
  page returned 404): https://support.claude.com/en/articles/11503834

The fetches are summarised by a small model, so field names were taken from
passages that quoted them. Re-check against the pages before building.

### One server, two hosts: MCP Apps is the shared layer

OpenAI's UI page says "New UI should use the shared fields and bridge methods"
of the MCP Apps standard, and to add `window.openai` extensions only for
capabilities "that the shared specification does not cover". Claude's page says
an MCP App "can run in Claude and in other hosts that support MCP Apps from one
codebase", registered with `registerAppTool()` and `registerAppResource()`,
which "generate each host's metadata for you". So: build the widget once as an
MCP App; do not write a ChatGPT-only widget.

Naming note: the OpenAI docs now call ChatGPT apps "plugins" and the entry in
ChatGPT "Plugins > Add custom MCP server". Older material says "Apps SDK" and
"developer mode". Expect the UI labels to move.

### Declaring tools and the widget

| Item | Field (verbatim from the pages) |
| --- | --- |
| Tool definition | `name`, `title`, `description`, `inputSchema`, `outputSchema`, `annotations` (`readOnlyHint`, `destructiveHint`, `openWorldHint`) |
| Tool links to widget | `_meta.ui.resourceUri` (e.g. `"ui://widget/todo.html"`). `_meta["openai/outputTemplate"]` is "OpenAI-specific optional/compatibility alias" |
| Status text while running | `_meta["openai/toolInvocation/invoking"]`, `_meta["openai/toolInvocation/invoked"]` (at most 64 characters each) |
| Widget callable from the UI | `_meta["openai/widgetAccessible"]` |
| Auth per tool | `securitySchemes` (`noauth`, `oauth2`), mirrored as `_meta["securitySchemes"]` "for clients that only read `_meta`" |
| Resource MIME type | `text/html;profile=mcp-app` (constant `RESOURCE_MIME_TYPE` from `@modelcontextprotocol/ext-apps`) |
| Resource CSP | `_meta.ui.csp` = `{ connectDomains, resourceDomains, frameDomains? }`; legacy `_meta["openai/widgetCSP"]` |
| Resource look and origin | `_meta.ui.prefersBorder`; `_meta["openai/widgetDomain"]`; `_meta.ui.permissions` (camera, microphone) |
| Tool result | `structuredContent` ("concise data the model can inspect"), `content` (text for the model), `_meta` ("hidden from the model layer") |
| Registering | `registerAppTool(server, ...)` and `registerAppResource(server, name, uri, meta, handler)` from `@modelcontextprotocol/ext-apps/server`; the handler returns `{ contents: [{ uri, mimeType, text }] }` |

Claude adds one requirement: `_meta.ui.domain` must be set, to the first 32 hex
characters of the SHA-256 of the server URL plus `.claudemcpcontent.com`. For
`https://plan.s-m-r-t.dev/mcp` that is
`482d08d029435c4039885c3c35060076.claudemcpcontent.com` (computed with the
command on the Claude page). It changes if the URL does.

### The widget bridge

The widget runs in a sandboxed iframe and talks to the host by JSON-RPC over
`postMessage`. Shared methods named on the pages: `ui/initialize`,
`ui/notifications/tool-input`, `ui/notifications/tool-result` (carries
`structuredContent`), `ui/update-model-context`, `tools/call`, `ui/message`.
`@modelcontextprotocol/ext-apps` wraps them: `new App(...)`, `app.ontoolresult`,
`app.callServerTool()`, `app.connect()` (with no transport argument it detects
the host).

ChatGPT-only extensions, all optional, on `window.openai`: `toolInput`,
`toolOutput` ("Returned `structuredContent`"), `toolResponseMetadata`
("Widget-only result metadata"), `widgetState` and `setWidgetState(state)`,
`callTool(name, arguments)`, `sendFollowUpMessage(message)`, `theme`, `locale`,
`displayMode`, `maxHeight`, `requestModal`, `uploadFile`. The mapping the
OpenAI page gives: `callTool` is `tools/call`; `sendFollowUpMessage` is
`ui/message`. Display modes: inline card, inline carousel, fullscreen,
picture-in-picture.

Two rules from the pages that shape the design: tool output is "untrusted
input" to the widget, and `widgetState` "belongs to one rendered UI instance.
Do not use it as the source of truth for business data."

### Auth

- ChatGPT: "Many plugin MCP servers can operate in a read-only, anonymous mode,
  but anything that exposes customer-specific data or write actions should
  authenticate users." A tool with `securitySchemes: [{ type: "noauth" }]` is
  "callable anonymously". OAuth 2.1 would need
  `/.well-known/oauth-protected-resource`, authorization server metadata with
  `code_challenge_methods_supported: ["S256"]`, and DCR or CIMD.
- Claude: "Your server can let Claude in with OAuth 2.0 ... with a static
  credential ... or with no authentication at all." OAuth redirect is
  `https://claude.ai/api/mcp/auth_callback`.

Our plans are anonymous capability documents with no user data, so: no auth,
`noauth` on every tool. See open question 3 for the write-tools objection.

### Transport and limits

Both require a public HTTPS Streamable HTTP endpoint at `/mcp` (OpenAI:
"Expose a streamable HTTP endpoint, typically at `/mcp`"; Claude: "Use
Streamable HTTP"; legacy HTTP+SSE is "being deprecated"). Claude limits (hosted
surfaces): about 150,000 characters per tool result and 240 seconds per call.
Claude does not support resource subscriptions or sampling. OpenAI documents no
`structuredContent` size limit.

### Connecting and publishing

- ChatGPT, own use: Plugins > plus > "Add custom MCP server", paste the HTTPS
  `/mcp` URL, choose authentication, accept the risk warning. After changing
  tools, use Refresh on the connection and start a new conversation. "Account
  and workspace policies apply"; plan restrictions are not stated.
- ChatGPT, publish: organization or individual verification; HTTPS privacy
  policy, support page, website and terms URLs; domain challenge token at
  `https://<hostname>/.well-known/openai-apps-challenge`; icons (square, at
  least 48 px, light and dark); tool annotations that pass automated scans;
  5 positive and 3 negative test cases, a video walkthrough, release notes and
  a test account "with sample data".
- Claude: add the URL as a custom connector (no Anthropic review), or submit to
  the directory (review; anyone on a paid plan can submit, on Team and
  Enterprise an Owner submits). Custom connectors need a Pro, Max, Team or
  Enterprise plan (search summary, not the page itself).

### Not verified

- The old `text/html+skybridge` MIME type and `openai/outputTemplate` as the
  primary key: the current pages use `text/html;profile=mcp-app` and
  `_meta.ui.resourceUri`. Use the current ones.
- Any `structuredContent` size cap for ChatGPT; the iframe size for each
  display mode.
- ChatGPT's own `ui.domain` format (Claude's is documented, ChatGPT's page
  only names `openai/widgetDomain`).
- The ChatGPT plan tiers that may add custom MCP servers.
- Claude's exact callback and IP allowlist text (support page 404).
- Whether the MCP Apps `App` class works with the v1 `@modelcontextprotocol/sdk`:
  ext-apps 2.0.3 declares peers `@modelcontextprotocol/server`, `client`, `core`
  `^2.0.0` and `zod ^4.2.0`.

## 2. The server: tools

Plan state is server-side. The model never holds the plan; it holds a `planId`
and reads compact snapshots. All tools are anonymous.

A plan: `{ id, cookbook, created, touched, expires }` plus a `HeadlessPlanner`
instance rebuilt from the stored cookbook on demand (`createHeadlessPlanner
(cookbook)`; undo history is per-request, see `run_commands`).

| Tool | Input | Result (`structuredContent`) | Annotations |
| --- | --- | --- | --- |
| `search_recipes` | `{ query?: string, limit?: 1..25 }` | `{ recipes: [{ id, label, group, description, requires }] }` from `recipes` (`./core`), ranked by the same matcher the browser assistant uses | `readOnlyHint: true` |
| `list_cookbooks` | `{}` | `{ cookbooks: [{ id, name, description, recipes }] }` from `libraryCookbooks` | `readOnlyHint: true` |
| `start_plan` | `{ cookbook?: libraryId, document?: Cookbook, name?: string }` | `{ planId, url, snapshot }` | writes, not destructive |
| `run_commands` | `{ planId, commands: [{ name, input }] (1..20), expectedRevision?: number, atomic?: boolean }` | `{ ok, results: [{ ok, receipt \| error }], snapshot, url }` | writes, not destructive |
| `get_plan` | `{ planId }` | `{ planId, url, snapshot }` | `readOnlyHint: true` |
| `validate_plan` | `{ planId }` | `{ ok, issues: [{ level, message }] }` | `readOnlyHint: true` |
| `export_plan` | `{ planId, name?: string }` | `{ url, jsonUrl, fileName, applyCommand }` | writes (extends TTL) |

All `openWorldHint: false`; `destructiveHint: false` (a plan can only be edited
and undone, never deleted, and expires on its own).

Notes:

- **Command set = existing set.** `run_commands` accepts exactly
  `COMMAND_NAMES` and validates with `commandTools` (the 19 commands, JSON
  Schema ready). The tool's `inputSchema` embeds the command union, so the model
  sees recipe and cookbook ids as enums. Navigation (`focus`) is accepted and
  ignored for the document. `apply_cookbook` and `import_cookbook` must be sent
  alone (they have no undo) and need `replace: true` on a non-empty plan, as in
  the browser.
- **Batching and atomic.** The runner has no atomic batch (noted in #22). The
  server applies commands in order and stops at the first failure. With
  `atomic: true` it rolls the earlier ones back with `planner.undo()` in reverse
  (every change command returns an `undoId`). `expectedRevision` is passed to
  the first command so a stale model action cannot overwrite a manual widget
  edit (`conflict`).
- **`start_plan` with a document** goes through the strict check
  (`createHeadlessPlanner` throws on a bad one; the tool turns that into a
  sentence). Documents with `overviews` lose them with a notice (phase 1
  limitation; the widget can still show the plan).
- **`validate_plan`** today means: the cookbook passes the strict import check,
  no `snapshot.unavailable` ids, the plan is not empty, every recipe's
  `requires` is satisfied. It grows into the canonical validator from smrt#3604
  when that lands (open question 6).
- **`export_plan`** returns the handoff in section 4. It also lifts the plan's
  TTL to the export TTL.
- **Descriptions** are written for routing: "plan a bakery app" should reach
  `list_cookbooks` then `start_plan`, then `run_commands`. Prompts are
  untrusted: no tool returns user-authored text unescaped into `content`.
- **Plan id.** 128 bits from `crypto.randomBytes(16)`, base64url (22 characters).
  The id is a bearer capability: anyone with the URL can read and edit. Tools
  never list plans.
- **Store.** Interface `PlanStore { get, put, touch, sweep }` so the backing can
  change. Rules: idle TTL 7 days (sliding, on any read or write), export TTL 30
  days from the last export, absolute cap 30 days from creation; cookbook JSON
  at most 256 KB; at most 500 commands per plan per hour; store-wide cap on
  plan count with oldest-idle eviction.
- **Rate limits.** Per client IP (from the ingress's forwarded header) token
  bucket, for example 60 tool calls per minute and 30 `start_plan` per hour;
  429 with `Retry-After`. ChatGPT and Claude both call from provider egress
  addresses, so a per-IP limit would treat all users of one host as one client.
  Limit per `planId` as well, and keep the IP limit generous. This is open
  question 4.

## 3. The widget in ChatGPT and Claude

**What renders.** The real planner component, not a look-alike: `Planner` from
`@happyvertical/smrt-planner` with `layout="own"`, `persistence="host"`, no
`inference`, `tabs=['cookbooks','recipes','features','layout','settings']`. The
Export tab is replaced by a small handoff panel (apply command, link, copy).
The widget is inline by default and offers fullscreen via the host's display
mode for the Layout tab.

**Build.** A separate widget build, not the static app. The static app is about
70 MB, most of it the on-device model runtime; a widget has no use for that and
host iframes want a small document. New `widget/` entry in this repository: a
Vite build of `widget/main.ts` that imports `Planner`, `cookbookStore` and the
MCP Apps `App`, emitted as one self-contained HTML string (script and CSS
inlined) that the server returns from `registerAppResource` at
`ui://widget/plan.html`. With everything inline, `_meta.ui.csp` can be empty
(`connectDomains: []`, `resourceDomains: []`), which keeps review simple. The
bundle size is unknown and must be measured in phase 2 (the catalog and recipe
data are bundled). If it is too large for inline delivery, serve the assets
from `plan.s-m-r-t.dev/widget/*` and list that origin in `resourceDomains`.
Singleton stores are fine here: one iframe, one plan.

**How it gets state.**

1. `start_plan`, `run_commands` and `get_plan` return
   `structuredContent: { planId, url, snapshot }` (about 3-5 KB, the size the
   snapshot is tested to) and put the full document in `_meta.cookbook`, which
   the model does not see (and `toolResponseMetadata` exposes to ChatGPT's
   widget; MCP Apps hosts get it in the tool result).
2. The widget receives `ui/notifications/tool-result` through `app.ontoolresult`
   and calls `cookbookStore.replace(cookbook)`. The user watches the plan build
   because each `run_commands` result re-renders the same widget instance.
3. A click in the widget runs the local controller. A thin wrapper forwards each
   successful command with `app.callServerTool('run_commands', { planId,
   commands, expectedRevision })`. On `conflict` it refetches with `get_plan`
   and replaces. The server stays the single source of truth.
4. UI-only state (active tab, scroll) goes in `widgetState` where the host
   provides it; nothing else.
5. After a manual edit the widget tells the model through the host's
   `ui/update-model-context` (or `sendFollowUpMessage` on ChatGPT) with a
   one-line summary, so the next model turn sees what the user changed.
6. Every value from `structuredContent` is treated as untrusted; the planner
   renders with Svelte (escaped).

## 4. The handoff

`export_plan` returns:

```json
{
  "url": "https://plan.s-m-r-t.dev/p/<id>",
  "jsonUrl": "https://plan.s-m-r-t.dev/p/<id>.json",
  "fileName": "bakery.cookbook.json",
  "applyCommand": "npx @happyvertical/smrt-cli kitchen apply https://plan.s-m-r-t.dev/p/<id>"
}
```

`GET /p/<id>` is content-negotiated on `Accept`:

- `text/html` (a browser): a small server-rendered page: plan name, recipe
  list, the apply command with a copy button, a download link, and an "open in
  the planner" link to `https://s-m-r-t.dev/planner/` (needs a load-from-URL
  entry there; otherwise download and import). No script beyond the copy button.
- `application/json` or no `Accept`: the cookbook document
  (`$schema: https://s-m-r-t.dev/schemas/cookbook/v1.json`), `content-type:
  application/json`, `access-control-allow-origin: *` so the static planner
  can fetch it. `smrt kitchen apply <url>` sends `Accept: application/json`.
- `/p/<id>.json` is the explicit JSON form.

Read-only, GET only, `x-robots-tag: noindex`, `cache-control: no-store`
(plans stay editable), 404 for unknown and 410 for expired ids (the CLI prints
the difference).

Two corrections to the issue text: the CLI package is `@happyvertical/smrt-cli`
(the epic says to verify the invocation), and I found no `kitchen apply <url>` command in
the smrt `main` checkout (`packages/cli` has no `kitchen` source or docs there;
it may live on the epic's release branch). It is a dependency of this phase
(open question 5).

## 5. Hosting

- **Process.** One small Node 26 service on the happyvertical cluster, one
  replica to start (stateful store), Deployment plus Service plus Ingress for
  `plan.s-m-r-t.dev` with TLS. DNS for the subdomain in the zone that holds
  `s-m-r-t.dev` (that site itself is static S3/CloudFront, so the subdomain is
  a new record pointing at the cluster ingress).
- **Routes.** `POST /mcp` (Streamable HTTP, stateless: a fresh protocol server
  per request, no session id; plans live in the store, so no sticky sessions),
  `GET /p/:id`, `GET /p/:id.json`, `GET /healthz`,
  `GET /.well-known/openai-apps-challenge` (for submission), and the privacy
  and support pages the ChatGPT submission needs.
- **SDK.** Use `@modelcontextprotocol/server` 2.x with
  `@modelcontextprotocol/ext-apps` 2.x, not `@modelcontextprotocol/sdk`. The
  registry shows `@modelcontextprotocol/sdk` at 1.32.1 (the v1 line) and
  `@modelcontextprotocol/server` at 2.3.1; ext-apps 2.0.3 peers on `server`
  `^2.0.0`; and smrt already pins `@modelcontextprotocol/server` 2.0.0 in
  `smrt-app-mcp`, `app-cli` and `mcp-conformance-fixture`. Starting on v1 would
  mean a migration immediately.
- **Is `smrt-app-mcp` reusable? No, not as a package.** `createMcpAppServer`
  builds its tool list from smrt-core's generated tools for `@smrt()` classes
  (class-name allow-lists, read-only detection by tool name, principal-aware
  policy, jobs-backed Tasks), and `createMcpProtocolServer` adapts that
  `McpAppServer`. Our tools are seven hand-written, non-object tools, so the
  package would contribute nothing but its constraints. `./sveltekit` is a
  SvelteKit route adapter, and we are not a SvelteKit app. What to copy, not
  import: the transport shape (stateless `POST /mcp`, fresh server per request,
  no session id, subscriptions refused) and the `@modelcontextprotocol/node`
  2.0.0 handler that the conformance fixture uses. If the maintainers want the
  issue's "reuse smrt-app-mcp" literally, the honest version is to run the
  conformance suite (`packages/mcp-conformance-fixture`) against this server.
- **Storage.** Start with SQLite (`node:sqlite`) on a small PVC, behind
  `PlanStore`: one table `plans(id, cookbook_json, created, touched, expires,
  exported)`, a sweep on a timer. It survives restarts, needs no new service,
  and a few hundred KB per plan is trivial. Memory-only is rejected because
  every deploy would invalidate shared links. If the cluster already runs a
  Postgres the team prefers, the interface moves there; one replica is the
  constraint that SQLite imposes.
- **Repo.** Recommend this repository (`smrt-planner`) under `server/` and
  `widget/`, as workspace packages. The server needs the recipe catalog, the
  command set and the widget from the same revision (a version skew would make
  the model suggest recipe ids the widget cannot show), and `@happyvertical/
  smrt-planner` is still private and unpublished. The cost: AGENTS.md says the
  repository holds demo logic only, so that rule needs a line saying a hosted
  service built from the demo's own core is allowed. The alternative is a new
  `smrt-plan-app` repository once the package is published and versioned.

## 6. Phasing

1. (done) Headless planner in `./core`.
2. Server skeleton: `/mcp` with `search_recipes`, `list_cookbooks`,
   `start_plan`, `run_commands`, `get_plan`; `/p/<id>` JSON; SQLite store;
   MCP Inspector and the conformance suite; no widget. Works in a Claude
   custom connector and in ChatGPT as a text-only app.
3. Widget build and `ui://widget/plan.html`; ChatGPT and Claude
   rendering; `ui.domain`.
4. `validate_plan`, `export_plan`, the HTML plan page, `smrt kitchen apply
   <url>`; deploy to the cluster.
5. Submission: ChatGPT (verification, policy pages, test cases, video) and the
   Claude directory.

Acceptance from the issue ("plan a bakery app" builds a plan in the widget and
returns a working apply command, in ChatGPT and as a Claude connector) is met at
the end of phase 4 for custom connectors; publishing is phase 5.

## 7. Open questions for the maintainer

1. **Repo and package.** Server and widget in `smrt-planner` (recommended), or a
   new `smrt-plan-app` repository? If here, is the AGENTS.md exception OK, and
   does the planner package get published first?
2. **Reuse of `smrt-app-mcp`.** The issue says to reuse it; the answer here is
   no (section 5). Confirm, or say what reuse you want (for example only the
   conformance harness).
3. **Anonymous writes.** Anonymous tools that create and edit stored documents
   are what OpenAI's guidance says "should authenticate users". Is an
   unauthenticated, rate-limited, TTL-bound store acceptable for ChatGPT
   review, or do we want optional OAuth (`noauth` plus `oauth2` on each tool)
   later? Either way the plan URL is a bearer link.
4. **Limits.** Are 7-day idle, 30-day export, 256 KB and the per-IP/per-plan
   limits right? Provider egress IPs make per-IP limiting coarse.
5. **CLI.** Does `smrt kitchen apply <url>` exist or get built in the epic's
   CLI work, and is `npx @happyvertical/smrt-cli ...` the published invocation?
   The issue text says `@happyvertical/smrt`.
6. **Validation.** Is the phase-1 `validate_plan` (strict import check plus
   `requires`) enough until smrt#3604's validator lands, and who owns moving to it?
7. **Overviews.** A Node host drops a cookbook's `overviews` (smrt-svelte's core
   widgets import `.svelte`). Acceptable for plan.s-m-r-t.dev, or should
   smrt-svelte split its widget definitions from components first?
8. **Host and cluster.** Which cluster, namespace and ingress, who creates the
   DNS record and certificate, and is there a preferred database over SQLite on a PVC?
9. **Accounts for submission.** Which OpenAI organization verifies and submits;
   who owns the privacy policy, support page and terms URLs; what is the
   "test account" for an anonymous app?
10. **Server-side model.** The issue allows `gpt-6-astra` via the gateway for
    server-side planning. This design needs none (the host model does the
    planning). Confirm that stays out of scope.
11. **Widget size and fullscreen.** Is an inline card plus fullscreen Layout tab
    the intended experience, or should the widget be read-only with edits only
    by conversation?
