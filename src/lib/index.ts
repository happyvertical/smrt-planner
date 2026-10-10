/**
 * smrt planner as a package: mount the `Planner` component in a host layout,
 * drive it with the typed command set (`./commands` has no UI in it), and read
 * its plan as a compact snapshot.
 *
 * @module
 */
export {
  type ByoPresetDefinition,
  type ConfigResult,
  type InferenceConfig,
  type InferenceMode,
  loadInferenceConfig,
  parseInferenceConfig,
} from './inference/config.ts';
export {
  createHostChat,
  type HostChatOptions,
  type HostRequest,
} from './inference/host.ts';
export { createOpenAIChat, testConnection } from './inference/openai.ts';
export {
  createPlannerAssistant,
  type PlannerAssistant,
  type PlannerChatInference,
  type PlannerConfigInference,
  type PlannerInference,
} from './planner/assistant.ts';
export * from './planner/commands/index.ts';
export { plannerController } from './planner/instance.ts';
export { default as Planner } from './planner/Planner.svelte';
export type { PlannerHandle, PlannerProps } from './planner/types.ts';
