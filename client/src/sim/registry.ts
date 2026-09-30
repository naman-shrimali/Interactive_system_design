import type { Scenario } from './types';
import { cacheStampede } from './scenarios/cacheStampede';
import { requestAnatomy } from './scenarios/requestAnatomy';
import { raft } from './scenarios/raft';
import { tokenBucket } from './scenarios/tokenBucket';
import { hashRing } from './scenarios/hashRing';
import { quorum } from './scenarios/quorum';
import { replicationLag } from './scenarios/replicationLag';
import { consumerRebalance } from './scenarios/consumerRebalance';
import { retryStorm } from './scenarios/retryStorm';
import { failover } from './scenarios/failover';

/** Every shipped scenario. The validator runs each one under every knob combination. */
export const SCENARIOS: Scenario[] = [cacheStampede, requestAnatomy, raft, tokenBucket, hashRing, quorum, replicationLag, consumerRebalance, retryStorm, failover];

export function scenariosFor(topic: string): Scenario[] {
  return SCENARIOS.filter((s) => s.topic === topic);
}
