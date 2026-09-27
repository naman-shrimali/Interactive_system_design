/**
 * Nodes that don't follow the icon-above-label anatomy. They still render the
 * same four handles so edges attach uniformly.
 */
import { cn } from '../../../lib/cn';
import { Badge, NodeHandles, stateWrapperClass, type DiagramNodeData } from './BaseNode';

type P = { data: DiagramNodeData };

/** Filled box with the label inside — used for services and actors. */
export function ServiceNode({ data }: P) {
  const state = data.state ?? 'normal';
  return (
    <div className={cn('relative', stateWrapperClass(state))}>
      {data.badge !== undefined && <Badge n={data.badge} />}
      <NodeHandles />
      <div
        className={cn(
          'min-w-28 rounded-md border-2 px-4 py-2.5 text-center',
          state === 'failed'
            ? 'border-red-600 bg-red-500 text-white'
            : 'border-indigo-700 bg-indigo-600 text-white',
        )}
      >
        <div className="text-[11px] font-semibold leading-tight">{data.label}</div>
        {data.sublabel && (
          <div className="text-[10px] leading-tight text-indigo-100">{data.sublabel}</div>
        )}
      </div>
    </div>
  );
}

/** Plain annotation box for callouts and tool panels. */
export function TextBoxNode({ data }: P) {
  return (
    <div className={cn('relative', stateWrapperClass(data.state ?? 'normal'))}>
      {data.badge !== undefined && <Badge n={data.badge} />}
      <NodeHandles />
      <div className="max-w-52 rounded-md border-2 border-violet-400 bg-raised px-3 py-2">
        <div className="text-[11px] font-semibold leading-tight text-ink">{data.label}</div>
        {data.sublabel && (
          <div className="whitespace-pre-line text-[10px] leading-snug text-ink-muted">
            {data.sublabel}
          </div>
        )}
      </div>
    </div>
  );
}

/** Small data table, e.g. a domain -> IP lookup. */
export function TableNode({ data }: P) {
  const table = data.tableData;
  if (!table) {
    return (
      <div className="rounded border-2 border-red-500 bg-raised px-3 py-2 text-[11px] text-red-500">
        table node “{data.label}” is missing tableData
      </div>
    );
  }
  return (
    <div className={cn('relative', stateWrapperClass(data.state ?? 'normal'))}>
      {data.badge !== undefined && <Badge n={data.badge} />}
      <NodeHandles />
      {data.label && (
        <div className="mb-1 text-center text-[11px] font-semibold text-ink">{data.label}</div>
      )}
      <table className="border-collapse bg-raised text-[10px]">
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th
                key={c}
                className="border border-line bg-surface px-2 py-1 font-semibold text-ink"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="border border-line px-2 py-1 text-ink-muted">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
