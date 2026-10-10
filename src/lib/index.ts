/**
 * smrt planner as a package: mount the `Planner` component in a host layout,
 * drive it with the typed command set (`./commands` has no UI in it), and read
 * its plan as a compact snapshot.
 *
 * @module
 */
export {
  createPlannerAssistant,
  type PlannerAssistant,
  type PlannerInference,
} from './planner/assistant.ts';
export * from './planner/commands/index.ts';
export { plannerController } from './planner/instance.ts';
export { default as Planner } from './planner/Planner.svelte';
export type { PlannerHandle, PlannerProps } from './planner/types.ts';
