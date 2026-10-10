import type {
  RecipeStore,
  SettingsStore,
  ThemeStore,
} from '../assistant/change.ts';
import { ThemeUndos } from '../assistant/theme-undo.svelte.ts';
import {
  type BrowserAssistantTransport,
  type ChatModel,
  createBrowserAssistantTransport,
} from '../assistant/transport.ts';
import { recipes } from '../recipes/index.ts';
import type { ThemeSetting } from '../theme/theme.ts';
import type { PlannerController } from './commands/index.ts';

/**
 * How a host gives the planner a language model. The model is whatever
 * implements `message()`: the browser's WebLLM, an API provider behind your
 * server, a test double. Choosing and loading it is the host's job; the
 * planner only asks it for one structured reply per turn.
 */
export interface PlannerInference {
  /** The model, or a function returning it (null until one is loaded). */
  chat: ChatModel | (() => ChatModel | null);
  /** Called with each reply the model wrote, e.g. to read it aloud. */
  onReply?: (text: string) => void;
}

export interface PlannerAssistant {
  /** For smrt-chat's `AssistantDock` (`transport`). */
  transport: BrowserAssistantTransport;
  /** The theme changes it made, each undoable; render with `toolCallData`. */
  themeUndos: ThemeUndos;
}

/** The controller's recipes as the store the assistant reads. Changes are commands. */
function recipeStoreOf(controller: PlannerController): RecipeStore {
  return {
    get ids() {
      return controller.snapshot().recipes.map((recipe) => recipe.id);
    },
    add: (...ids) =>
      void controller.run({ name: 'add_recipes', input: { ids } }),
    remove: (...ids) =>
      void controller.run({ name: 'remove_recipes', input: { ids } }),
  };
}

function settingsStoreOf(controller: PlannerController): SettingsStore {
  return {
    read: () => {
      const { currency, taxRate, paymentTerms } =
        controller.snapshot().settings;
      return {
        currency,
        taxRate: Number((taxRate / 100).toFixed(6)),
        paymentTerms,
      };
    },
    write: (settings) => {
      void controller.run({
        name: 'set_settings',
        input: {
          currency: settings.currency,
          taxRate: Number((settings.taxRate * 100).toFixed(4)),
          ...(settings.paymentTerms
            ? { paymentTerms: settings.paymentTerms }
            : {}),
        },
      });
    },
  };
}

function themeStoreOf(controller: PlannerController): ThemeStore {
  return {
    read: () => {
      const { preset, primary, colorScheme } = controller.snapshot().theme;
      const theme: ThemeSetting = {};
      if (preset) theme.preset = preset;
      if (primary) theme.custom = { primary };
      if (colorScheme !== 'system') {
        theme.colorScheme = colorScheme as ThemeSetting['colorScheme'];
      }
      return Object.keys(theme).length ? theme : undefined;
    },
    write: (theme) => {
      if (!theme) {
        void controller.run({ name: 'reset_theme', input: {} });
        return;
      }
      void controller.run({ name: 'reset_theme', input: {} });
      void controller.run({
        name: 'set_theme',
        input: {
          ...(theme.preset ? { preset: theme.preset } : {}),
          ...(theme.custom ? { primary: theme.custom.primary } : {}),
          ...(theme.colorScheme ? { colorScheme: theme.colorScheme } : {}),
        },
      });
    },
  };
}

/**
 * The planner's assistant for any controller: a chat transport whose every
 * change is a command on `controller`, so it works against a host's own mount
 * as well as the static app. Cookbook proposals are not offered here (they
 * need a confirmation card the host would render); everything else is.
 */
export function createPlannerAssistant(
  controller: PlannerController,
  inference: PlannerInference,
): PlannerAssistant {
  const theme = themeStoreOf(controller);
  const themeUndos = new ThemeUndos(theme, controller);
  const transport = createBrowserAssistantTransport({
    model: () =>
      typeof inference.chat === 'function'
        ? (inference.chat as () => ChatModel | null)()
        : inference.chat,
    store: recipeStoreOf(controller),
    recipes,
    // No cookbook proposals: they need a confirmation card the host renders.
    cookbooks: [],
    settings: settingsStoreOf(controller),
    theme,
    themeUndos,
    controller,
    onReply: inference.onReply,
  });
  return { transport, themeUndos };
}
