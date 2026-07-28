import type { NodeKind } from '../../../types';
import {
  CacheNode,
  CacheStackNode,
  CdnNode,
  ClientMobileNode,
  ClientNode,
  DatabaseNode,
  DatabaseStackNode,
  DnsNode,
  LoadBalancerNode,
  MessageQueueNode,
  NosqlNode,
  ServerNode,
  ServerStackNode,
  WorkerStackNode,
} from './IconNodes';
import { ServiceNode, TableNode, TextBoxNode } from './SpecialNodes';
import { GroupNode } from './GroupNode';

export const nodeTypes = {
  client: ClientNode,
  client_mobile: ClientMobileNode,
  dns: DnsNode,
  cdn: CdnNode,
  load_balancer: LoadBalancerNode,
  server: ServerNode,
  server_stack: ServerStackNode,
  worker_stack: WorkerStackNode,
  database: DatabaseNode,
  database_stack: DatabaseStackNode,
  nosql: NosqlNode,
  cache: CacheNode,
  cache_stack: CacheStackNode,
  message_queue: MessageQueueNode,
  service: ServiceNode,
  text_box: TextBoxNode,
  table: TableNode,
  // Not a NodeKind — containers are synthesised by specToFlow.
  group_box: GroupNode,
};

/** Compile-time guarantee that every NodeKind has a renderer. */
const _exhaustive: Record<NodeKind, unknown> & { group_box: unknown } = nodeTypes;
void _exhaustive;

export type { DiagramNodeData } from './BaseNode';
