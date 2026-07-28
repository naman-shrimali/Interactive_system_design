/**
 * The 14 icon-based node types. Each is a thin wrapper over BaseNode: pick an
 * icon and a colour. Hues are chosen to differ in lightness as well as hue, so
 * the diagram stays readable in both themes and without colour vision.
 */
import {
  Braces,
  Cloud,
  Cpu,
  Database,
  Globe,
  Mail,
  Monitor,
  Network,
  Server,
  Smartphone,
  Zap,
} from 'lucide-react';
import { BaseNode, type DiagramNodeData } from './BaseNode';

const ICON = 26;

const SLATE = 'border-slate-400 text-slate-500';
const SKY = 'border-sky-500 text-sky-500';
const INDIGO = 'border-indigo-500 text-indigo-500';
const EMERALD = 'border-emerald-500 text-emerald-500';
const BLUE = 'border-blue-500 text-blue-500';
const VIOLET = 'border-violet-500 text-violet-500';
const AMBER = 'border-amber-500 text-amber-500';

type P = { data: DiagramNodeData };

export const ClientNode = ({ data }: P) => (
  <BaseNode data={data} icon={<Monitor size={ICON} />} accent={SLATE} />
);
export const ClientMobileNode = ({ data }: P) => (
  <BaseNode data={data} icon={<Smartphone size={ICON} />} accent={SLATE} />
);
export const DnsNode = ({ data }: P) => (
  <BaseNode data={data} icon={<Globe size={ICON} />} accent={SLATE} />
);
export const CdnNode = ({ data }: P) => (
  <BaseNode data={data} icon={<Cloud size={ICON} />} accent={SKY} />
);
export const LoadBalancerNode = ({ data }: P) => (
  <BaseNode data={data} icon={<Network size={ICON} />} accent={INDIGO} />
);
export const ServerNode = ({ data }: P) => (
  <BaseNode data={data} icon={<Server size={ICON} />} accent={EMERALD} />
);
export const ServerStackNode = ({ data }: P) => (
  <BaseNode data={data} icon={<Server size={ICON} />} accent={EMERALD} stacked />
);
export const WorkerStackNode = ({ data }: P) => (
  <BaseNode data={data} icon={<Cpu size={ICON} />} accent={EMERALD} stacked />
);
export const DatabaseNode = ({ data }: P) => (
  <BaseNode data={data} icon={<Database size={ICON} />} accent={BLUE} />
);
export const DatabaseStackNode = ({ data }: P) => (
  <BaseNode data={data} icon={<Database size={ICON} />} accent={BLUE} stacked />
);
export const NosqlNode = ({ data }: P) => (
  <BaseNode data={data} icon={<Braces size={ICON} />} accent={BLUE} />
);
export const CacheNode = ({ data }: P) => (
  <BaseNode data={data} icon={<Zap size={ICON} />} accent={VIOLET} />
);
export const CacheStackNode = ({ data }: P) => (
  <BaseNode data={data} icon={<Zap size={ICON} />} accent={VIOLET} stacked />
);
/** Arrow-shaped box, echoing the queue idiom from the source material. */
export const MessageQueueNode = ({ data }: P) => (
  <BaseNode
    data={data}
    icon={<Mail size={20} />}
    accent={AMBER}
    iconBoxClassName="h-11 w-24 [clip-path:polygon(0%_0%,88%_0%,100%_50%,88%_100%,0%_100%)]"
  />
);
