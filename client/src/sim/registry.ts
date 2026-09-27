import type { Scenario } from './types';
import { cacheStampede } from './scenarios/cacheStampede';
import { requestAnatomy } from './scenarios/requestAnatomy';
import { raft } from './scenarios/raft';

/** Every shipped scenario. The validator runs each one under every knob combination. */
export const SCENARIOS: Scenario[] = [cacheStampede, requestAnatomy, raft];

export function scenariosFor(topic: string): Scenario[] {
  return SCENARIOS.filter((s) => s.topic === topic);
}
