import type { CircuitColumn, CircuitMode } from "../types";
import { formatParam } from "../lib/utils";

type CircuitVisualizerProps = {
  circuitMode: CircuitMode;
  onToggleMode: () => void;
  columns: CircuitColumn[];
  qubitCount: number;
};

export function CircuitVisualizer({
  circuitMode,
  onToggleMode,
  columns,
  qubitCount,
}: CircuitVisualizerProps): JSX.Element {
  const rowGap = 58;
  const circuitHeight = rowGap * qubitCount + 24;
  const circuitWidth = Math.max(760, 110 + columns.length * 92);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-300">Circuit Visualizer</h2>
        <button
          onClick={onToggleMode}
          className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs uppercase tracking-wide hover:bg-neutral-700"
        >
          {circuitMode === "logical" ? "Show Transpiled (Ion Trap) Circuit" : "Show Logical Circuit"}
        </button>
      </div>

      <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
        <div className="min-w-max">
          <svg width={circuitWidth} height={circuitHeight}>
            {Array.from({ length: qubitCount }, (_, q) => {
              const y = 18 + q * rowGap;
              return (
                <g key={`wire-${q}`}>
                  <text x={4} y={y + 4} fontSize="12" fill="#a3a3a3">
                    q{q}
                  </text>
                  <line x1={24} y1={y} x2={circuitWidth - 24} y2={y} stroke="#525252" strokeWidth={1.6} />
                </g>
              );
            })}

            {columns.map((column, colIdx) => {
              const x = 66 + colIdx * 92;
              return (
                <g key={`col-${colIdx}`}>
                  {column.gates.map((gate, gateIdx) => {
                    if (gate.pairWith === undefined || gate.qubit > gate.pairWith) return null;
                    const y1 = 18 + gate.qubit * rowGap;
                    const y2 = 18 + gate.pairWith * rowGap;
                    return (
                      <line
                        key={`conn-${colIdx}-${gateIdx}`}
                        x1={x}
                        y1={y1}
                        x2={x}
                        y2={y2}
                        stroke="#a3a3a3"
                        strokeWidth={1.5}
                        opacity={0.85}
                      />
                    );
                  })}

                  {column.gates.map((gate, gateIdx) => {
                    const y = 18 + gate.qubit * rowGap;
                    return (
                      <g key={`gate-${colIdx}-${gateIdx}`}>
                        <rect
                          x={x - 24}
                          y={y - 17}
                          width={48}
                          height={34}
                          rx={6}
                          fill={gate.tone}
                          stroke="#fafafa"
                          strokeOpacity={0.25}
                        />
                        <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fill="#fafafa" fontWeight="600">
                          {gate.label}
                        </text>
                        {gate.param !== undefined ? (
                          <text x={x} y={y + 28} textAnchor="middle" fontSize="10" fill="#d4d4d8">
                            {formatParam(gate.param)}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}
