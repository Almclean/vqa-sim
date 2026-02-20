import { MOLECULES, type MoleculeKey } from "../data/molecules";
import type { Algorithm } from "../types";
import { parseEdge } from "../lib/utils";

type Point = { x: number; y: number };

type TargetDomainWidgetProps = {
  algorithm: Algorithm;
  running: boolean;
  nodeCount: number;
  edges: string[];
  selectedNode: number | null;
  graphPositions: Point[];
  onNodeClick: (node: number) => void;
  onAddNode: () => void;
  onRemoveNode: () => void;
  molecule: MoleculeKey;
  onMoleculeChange: (molecule: MoleculeKey) => void;
};

export function TargetDomainWidget({
  algorithm,
  running,
  nodeCount,
  edges,
  selectedNode,
  graphPositions,
  onNodeClick,
  onAddNode,
  onRemoveNode,
  molecule,
  onMoleculeChange,
}: TargetDomainWidgetProps): JSX.Element {
  const moleculeSpec = MOLECULES[molecule];

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-300">Target Domain</h2>

      {algorithm === "qaoa" ? (
        <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>Nodes: {nodeCount}</span>
            <span>Edges: {edges.length}</span>
          </div>

          <svg viewBox="0 0 256 256" className="h-64 w-full rounded-md border border-neutral-800 bg-neutral-950/80">
            {edges.map((key) => {
              const [a, b] = parseEdge(key);
              const pa = graphPositions[a];
              const pb = graphPositions[b];
              if (!pa || !pb) return null;
              return (
                <line
                  key={key}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke="#22d3ee"
                  strokeWidth={2.3}
                  opacity={0.9}
                />
              );
            })}

            {graphPositions.map((p, idx) => (
              <g key={`node-${idx}`} onClick={() => onNodeClick(idx)} className="cursor-pointer">
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={18}
                  fill={selectedNode === idx ? "#0e7490" : "#262626"}
                  stroke={selectedNode === idx ? "#67e8f9" : "#737373"}
                  strokeWidth={2}
                />
                <text
                  x={p.x}
                  y={p.y + 5}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#f5f5f5"
                  style={{ userSelect: "none" }}
                >
                  {idx}
                </text>
              </g>
            ))}
          </svg>

          <div className="flex gap-2">
            <button
              onClick={onAddNode}
              className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
            >
              Add Node
            </button>
            <button
              onClick={onRemoveNode}
              className="flex-1 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
            >
              Remove Node
            </button>
          </div>

          <p className="text-xs text-neutral-500">Click one node, then another to toggle an edge.</p>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
          <select
            value={molecule}
            onChange={(e) => onMoleculeChange(e.target.value as MoleculeKey)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring-2"
            disabled={running}
          >
            {(Object.keys(MOLECULES) as MoleculeKey[]).map((key) => (
              <option key={key} value={key}>
                {MOLECULES[key].label}
              </option>
            ))}
          </select>

          <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
            <div className="relative h-20">
              <div className="absolute left-8 right-8 top-1/2 h-px -translate-y-1/2 bg-neutral-700" />
              {moleculeSpec.atoms.map((atom, idx) => (
                <div
                  key={`${atom.symbol}-${idx}`}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${atom.x}%` }}
                >
                  <div className="grid h-12 w-12 place-items-center rounded-full border border-amber-500/50 bg-amber-900/30 text-sm font-semibold text-amber-200">
                    {atom.symbol}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-neutral-400">Theoretical min: {moleculeSpec.theoreticalMin.toFixed(5)} Ha</p>
          </div>
        </div>
      )}
    </section>
  );
}
