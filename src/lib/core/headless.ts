import { parseCookbookWith } from '../cookbook/parse.ts';
import type { Cookbook } from '../cookbook/types.ts';
import { createPlainHost } from '../planner/commands/plain-host.ts';
import { createCommandRunner } from '../planner/commands/runner.ts';
import {
  buildCommandTools,
  type CommandTool,
  commandTools,
} from '../planner/commands/schemas.ts';
import type {
  CommandName,
  CommandResult,
  PlannerCommand,
  PlanSnapshot,
  RunOptions,
} from '../planner/commands/types.ts';
import type { PromptCatalog } from './catalog.ts';

export interface HeadlessPlannerOptions {
  /**
   * Restrict the recipes and library cookbooks this plan may name (the same
   * shape `buildHostPrompt` takes). Ids outside it fail validation as
   * `invalid_input`, exactly as a bad enum value does. Default: the whole
   * library.
   */
  catalog?: PromptCatalog;
}

/**
 * One plan held in plain objects, driven by the same commands as the browser
 * planner. Runs in plain Node; any number may coexist.
 */
export interface HeadlessPlanner {
  /**
   * Run one command: same names, input schemas, validation, error codes and
   * receipts as the browser controller. Never throws.
   */
  run(command: PlannerCommand, options?: RunOptions): CommandResult;
  /** Untyped form for commands that arrive as data (a model's tool call). */
  run(command: unknown, options?: RunOptions): CommandResult;
  /** The current plan, read-only and compact. */
  snapshot(): PlanSnapshot;
  /** The plan as a cookbook document (what `export_cookbook` writes). */
  cookbook(): Cookbook;
  /**
   * Undo the most recent undoable change. `not_found` when there is none; the
   * command `undo` with an explicit `undoId` is available through `run`.
   */
  undo(): CommandResult;
  /** Call `listener` with the snapshot now and after every command. */
  subscribe(listener: (snapshot: PlanSnapshot) => void): () => void;
  /** The command tools this plan validates against (a restricted catalog narrows the enums). */
  readonly tools: readonly CommandTool[];
}

/**
 * A planner with no UI, no runes and no module state: the command set over a
 * plain-object plan, for a Node server (an MCP server holds one per plan id).
 *
 * `cookbook` is the starting document; it goes through the strict import
 * check and the call throws on a document that fails it. Everything after that
 * reports errors through `run`'s result instead.
 */
export function createHeadlessPlanner(
  cookbook?: Cookbook,
  options: HeadlessPlannerOptions = {},
): HeadlessPlanner {
  let initial: Cookbook | undefined;
  if (cookbook !== undefined) {
    const parsed = parseCookbookWith(cookbook);
    if (!parsed.ok) throw new Error(parsed.error);
    initial = parsed.cookbook;
  }
  const host = createPlainHost(initial);
  const catalog = options.catalog;
  const tools = catalog
    ? buildCommandTools(
        catalog.recipes.map((recipe) => recipe.id),
        catalog.cookbooks.map((entry) => entry.id),
      )
    : undefined;
  const runner = createCommandRunner(
    host,
    {},
    tools && {
      schemas: Object.fromEntries(
        tools.map((tool) => [tool.name, tool.inputSchema]),
      ) as Record<CommandName, CommandTool['inputSchema']>,
    },
  );
  return {
    run: runner.run,
    snapshot: runner.snapshot,
    subscribe: runner.subscribe,
    cookbook: () => host.cookbook.snapshot(),
    undo() {
      const undoId = runner.snapshot().undo.at(-1);
      if (!undoId) {
        return {
          ok: false,
          error: { code: 'not_found', message: 'Nothing to undo.' },
        };
      }
      return runner.run({ name: 'undo', input: { undoId } });
    },
    tools: tools ?? commandTools,
  };
}
