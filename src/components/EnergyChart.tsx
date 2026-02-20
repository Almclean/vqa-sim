import { useState, type MouseEvent } from "react";
import { MOLECULES, type MoleculeKey } from "../data/molecules";
import type { Algorithm } from "../types";

type EnergyChartProps = {
  algorithm: Algorithm;
  molecule: MoleculeKey;
  edges: string[];
  costHistory: number[];
  currentMetric: number;
  iteration: number;
};

export function EnergyChart({
  algorithm,
  molecule,
  edges,
  costHistory,
  currentMetric,
  iteration,
}: EnergyChartProps): JSX.Element {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const chartValues = costHistory.length > 0 ? costHistory : [currentMetric];
  const vqeMin = MOLECULES[molecule].theoreticalMin;
  const latest = chartValues[chartValues.length - 1] ?? currentMetric;
  const previous = chartValues.length > 1 ? chartValues[chartValues.length - 2] : latest;
  const delta = latest - previous;

  let yMin = Math.min(...chartValues);
  let yMax = Math.max(...chartValues);

  if (algorithm === "vqe") {
    yMin = Math.min(yMin, vqeMin) - 0.15;
    yMax = Math.max(yMax, vqeMin) + 0.15;
  } else {
    yMin = Math.min(0, yMin) - 0.15;
    yMax = Math.max(Math.max(1, edges.length), yMax) + 0.15;
  }

  if (Math.abs(yMax - yMin) < 1e-9) {
    yMin -= 1;
    yMax += 1;
  }

  const CHART_W = 920;
  const CHART_H = 300;
  const margin = { left: 56, right: 20, top: 20, bottom: 38 };
  const plotW = CHART_W - margin.left - margin.right;
  const plotH = CHART_H - margin.top - margin.bottom;

  const xAt = (idx: number): number =>
    chartValues.length <= 1 ? margin.left : margin.left + (idx / (chartValues.length - 1)) * plotW;
  const yAt = (v: number): number => margin.top + ((yMax - v) / (yMax - yMin)) * plotH;

  const polyline = chartValues.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");

  const onChartMove = (evt: MouseEvent<SVGSVGElement>) => {
    if (chartValues.length === 0) return;
    const rect = evt.currentTarget.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * CHART_W;
    const t = (x - margin.left) / plotW;
    const idx = Math.max(0, Math.min(chartValues.length - 1, Math.round(t * (chartValues.length - 1))));
    setHoverIndex(idx);
  };

  const metricLabel = algorithm === "vqe" ? "ENERGY (HARTREES)" : "COST (EXPECTATION VAL)";

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-300">Energy Landscape</h2>
        <div className="flex flex-col items-end text-xs text-neutral-400">
          <span>Iteration: {iteration}</span>
          <span>
            Latest: {latest.toFixed(6)}{" "}
            <span className={delta >= 0 ? "text-red-300" : "text-emerald-300"}>
              ({delta >= 0 ? "+" : ""}
              {delta.toFixed(6)})
            </span>
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-2">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="h-72 w-full"
          onMouseMove={onChartMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <line
            x1={margin.left}
            y1={CHART_H - margin.bottom}
            x2={CHART_W - margin.right}
            y2={CHART_H - margin.bottom}
            stroke="#a3a3a3"
            strokeWidth={1}
          />
          <line
            x1={margin.left}
            y1={margin.top}
            x2={margin.left}
            y2={CHART_H - margin.bottom}
            stroke="#a3a3a3"
            strokeWidth={1}
          />

          {algorithm === "vqe" ? (
            <line
              x1={margin.left}
              y1={yAt(vqeMin)}
              x2={CHART_W - margin.right}
              y2={yAt(vqeMin)}
              stroke="#34d399"
              strokeWidth={1.2}
              strokeDasharray="5 4"
            />
          ) : null}

          <polyline fill="none" stroke="#22d3ee" strokeWidth={2.2} points={polyline} />

          <text x={CHART_W / 2} y={CHART_H - 8} textAnchor="middle" fill="#a3a3a3" fontSize="12">
            OPTIMIZATION ITERATIONS
          </text>
          <text
            x={18}
            y={CHART_H / 2}
            fill="#a3a3a3"
            fontSize="11"
            textAnchor="middle"
            transform={`rotate(-90, 18, ${CHART_H / 2})`}
          >
            {metricLabel}
          </text>

          <text x={margin.left} y={margin.top - 6} fill="#a3a3a3" fontSize="11">
            {yMax.toFixed(3)}
          </text>
          <text x={margin.left} y={CHART_H - margin.bottom + 16} fill="#a3a3a3" fontSize="11">
            {yMin.toFixed(3)}
          </text>

          {hoverIndex !== null && chartValues[hoverIndex] !== undefined ? (
            <g>
              <line
                x1={xAt(hoverIndex)}
                y1={margin.top}
                x2={xAt(hoverIndex)}
                y2={CHART_H - margin.bottom}
                stroke="#f5f5f5"
                strokeDasharray="4 4"
                strokeWidth={1}
                opacity={0.8}
              />
              <circle cx={xAt(hoverIndex)} cy={yAt(chartValues[hoverIndex])} r={4.5} fill="#f59e0b" />
              <rect x={xAt(hoverIndex) + 8} y={margin.top + 6} width={160} height={40} rx={6} fill="#0a0a0a" opacity={0.9} />
              <text x={xAt(hoverIndex) + 16} y={margin.top + 23} fill="#e5e7eb" fontSize="11">
                iter: {hoverIndex}
              </text>
              <text x={xAt(hoverIndex) + 16} y={margin.top + 38} fill="#e5e7eb" fontSize="11">
                value: {chartValues[hoverIndex].toFixed(6)}
              </text>
            </g>
          ) : null}
        </svg>
      </div>
    </section>
  );
}
