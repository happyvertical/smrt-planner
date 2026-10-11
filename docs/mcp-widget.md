# Host-backed Planner resource

Build with Node 26: `pnpm exec svelte-kit sync && node scripts/build-mcp.ts`.
The build writes a self-contained `app/mcp.html` (inline script and styles).
Kitchen injects its MCP Apps bridge before that script. The bridge provides
`window.smrtKitchen.callTool(name, args)` returning structured content and
`subscribe(listener)` returning an unsubscribe function and replaying the latest result.

The authoritative tool payload is `{ planId, state: { snapshot, cookbook } }`.
Snapshot and cookbook must be read atomically from the same engine state.
Replayed receipts can refer to an earlier revision; `state` must always be current.

`HostPlanner` mounts the existing Planner panels against their existing singleton
stores. One host mount per document is supported. Tool updates hydrate those stores.
UI document edits are captured as one `import_cookbook` command with `replace: true`,
a UUID batch id and the authoritative expected revision. The visible document is
restored while the request runs. This preserves the shared command engine and
validates the whole edit atomically. Focus remains local. Standalone Planner is unchanged.

Controls are disabled while a request is outstanding. A transport failure preserves
the same request/id for explicit retry; an application rejection preserves the draft
and exposes it for copying. Stale edits are never automatically rebased or resubmitted.
The wrapper uses host persistence; it does not hydrate or save the cookbook document
in localStorage. Existing panel preferences/sample data remain browser-local.

## UI batch verification contract

Full tests and review are deferred until the user declares the UI batch complete.
The current minimal check compiles the browser artifact and TypeScript source.

| Behavior | Trigger / positive case | Failure case | Context / executor | Runtime / edge | Planned level / command |
| --- | --- | --- | --- | --- | --- |
| Shared authoritative view | Tool state hydrates mounted panels | Missing/malformed document rejected; older revision ignored | One host mount / Kitchen engine | Browser / atomic tool state | Browser render plus integration test after batch |
| Revision-safe edits | Panel edit submits import at current revision | Conflict preserves draft; no overwrite | User / atomic engine batch | Browser + Node 26 / run_commands | Integration after batch |
| Retry | Explicit retry reuses UUID and payload | Ambiguous transport failure leaves controls locked | User / server idempotency journal | MCP bridge / transport loss | Integration after batch |
| External updates | Tool notification refreshes same stores | Concurrent local draft retained | Host / engine snapshot | MCP notification / unknown payload | Integration after batch |
| Local compatibility | Standalone mounts normal Planner | N/A: remote wrapper absent | Browser-local store | Existing static app | Existing regression suite after batch |

No authentication, tenancy or SQL behavior changes in this adapter. Kitchen owns
plan authorization and persistence. No full validation or release readiness is claimed.
