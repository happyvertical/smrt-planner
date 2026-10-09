import type {
  AssistantMessage,
  AssistantSendMessageInput,
  AssistantSendMessageResult,
  AssistantThreadSummary,
  AssistantTransport,
} from '@happyvertical/smrt-chat/svelte';
import type { Recipe } from '../recipes/types.ts';
import {
  applyChange,
  applySettings,
  buildResponseSchema,
  describeChange,
  parseChange,
  type RecipeStore,
  type SettingsStore,
} from './change.ts';
import type { OfferRef } from './offers.svelte.ts';
import { buildSystemPrompt, type CookbookBrief } from './prompt.ts';

/** The slice of `@happyvertical/ai`'s provider the transport uses. */
export interface ChatModel {
  message(
    text: string,
    options?: {
      history?: { role: 'system' | 'user' | 'assistant'; content: string }[];
      responseSchema?: Record<string, unknown> | string;
      temperature?: number;
      signal?: AbortSignal;
    },
  ): Promise<string>;
}

export interface BrowserTransportOptions {
  /** The loaded model; null until the visitor has downloaded one. */
  model: () => ChatModel | null;
  store: RecipeStore;
  recipes: readonly Recipe[];
  /** Cookbooks the assistant may offer (id, name, summary). */
  cookbooks?: readonly CookbookBrief[];
  /** Proposes a cookbook; the person's click applies it. Null: already pending. */
  offers?: { offer(cookbookId: string): OfferRef | null };
  /** The app settings the assistant may read and change. */
  settings?: SettingsStore;
  now?: () => number;
  /** Called with each reply the model produced (not errors), e.g. to read it aloud. */
  onReply?: (text: string) => void;
}

export interface BrowserAssistantTransport extends AssistantTransport {
  /** Stop the turn in flight, if any. */
  abort(): void;
}

const THREAD_TITLE = 'Plan your app';
/** The one line the chat opens with. */
export const GREETING = 'What would you like to build?';
/** Earlier turns sent back to the model; a small model needs a short context. */
const HISTORY_TURNS = 6;

/**
 * An `AssistantTransport` that runs entirely in the browser: one thread, kept
 * in memory, whose turns go to the on-device model with the recipes as a
 * constrained schema. The model's `add`/`remove` are applied through the same
 * recipe store the Planner cards drive. It never navigates.
 */
export function createBrowserAssistantTransport(
  options: BrowserTransportOptions,
): BrowserAssistantTransport {
  const now = options.now ?? (() => Date.now());
  let counter = 0;
  const id = (prefix: string) => `${prefix}-${++counter}`;
  const thread: AssistantThreadSummary = {
    id: 'planner',
    title: THREAD_TITLE,
    isResolved: false,
    messageCount: 0,
    lastMessageAt: null,
  };
  const messages: AssistantMessage[] = [];
  const seen = new Map<string, AssistantSendMessageResult>();
  let controller: AbortController | null = null;

  const push = (
    role: 'user' | 'assistant',
    content: string,
    clientRequestId?: string,
    toolCallData?: unknown,
  ): AssistantMessage => {
    const message: AssistantMessage = {
      id: id('m'),
      threadId: thread.id,
      content,
      role,
      createdAt: new Date(now()),
      ...(clientRequestId ? { clientRequestId } : {}),
    };
    if (toolCallData) message.toolCallData = toolCallData;
    messages.push(message);
    thread.messageCount = messages.length;
    thread.lastMessageAt = message.createdAt;
    return message;
  };
  const greeting = push('assistant', GREETING);

  async function turn(
    text: string,
  ): Promise<{ content: string; offer?: OfferRef }> {
    const model = options.model();
    if (!model) {
      return {
        content:
          'Download a model first, then I can help. The cards on the Planner page work without one.',
      };
    }
    controller = new AbortController();
    try {
      const cookbooks = options.cookbooks ?? [];
      const prior = messages
        .filter((m) => m !== greeting)
        .slice(0, -1)
        .slice(-HISTORY_TURNS)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
      const raw = await model.message(text, {
        history: [
          {
            role: 'system',
            content: buildSystemPrompt(
              options.recipes,
              options.store.ids,
              cookbooks,
              options.settings?.read(),
            ),
          },
          ...prior,
        ],
        responseSchema: buildResponseSchema(
          options.recipes,
          cookbooks,
          !!options.settings,
        ),
        temperature: 0,
        signal: controller.signal,
      });
      const change = parseChange(raw, options.recipes, cookbooks);
      const applied = applyChange(options.store, change);
      const summary = [
        describeChange(applied, options.recipes),
        options.settings
          ? applySettings(options.settings, change.settings)
          : '',
      ]
        .filter(Boolean)
        .join(' ');
      const offer = change.cookbook
        ? (options.offers?.offer(change.cookbook) ?? undefined)
        : undefined;
      const offered = offer
        ? cookbooks.find((c) => c.id === change.cookbook)
        : undefined;
      const line = change.reply || (offered ? `Set up ${offered.name}?` : '');
      const reply = [line, summary].filter(Boolean).join(' ');
      if (line) options.onReply?.(line);
      return { content: reply || 'Done.', offer };
    } catch (error) {
      if (controller?.signal.aborted) return { content: 'Stopped.' };
      const detail = error instanceof Error ? error.message : String(error);
      return { content: `Sorry, the model could not answer: ${detail}` };
    } finally {
      controller = null;
    }
  }

  return {
    async listThreads() {
      return [thread];
    },
    async createThread() {
      return thread;
    },
    async loadMessages() {
      return [...messages];
    },
    async sendMessage(
      input: AssistantSendMessageInput,
    ): Promise<AssistantSendMessageResult> {
      const cached = seen.get(input.clientRequestId);
      if (cached) return cached;
      const userMessage = push('user', input.content, input.clientRequestId);
      const reply = await turn(input.content);
      const result: AssistantSendMessageResult = {
        inProgress: false,
        userMessage,
        assistantMessage: push(
          'assistant',
          reply.content,
          undefined,
          reply.offer,
        ),
      };
      seen.set(input.clientRequestId, result);
      return result;
    },
    async uploadAttachment(file: File) {
      throw new Error(`The assistant cannot take attachments (${file.name}).`);
    },
    abort() {
      controller?.abort();
    },
  };
}
