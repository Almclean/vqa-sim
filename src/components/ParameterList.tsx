import type { Algorithm } from "../types";
import type { Dispatch, SetStateAction } from "react";

type ParameterListProps = {
  algorithm: Algorithm;
  depth: number;
  running: boolean;
  gammas: number[];
  betas: number[];
  thetas: number[];
  setGammas: Dispatch<SetStateAction<number[]>>;
  setBetas: Dispatch<SetStateAction<number[]>>;
  setThetas: Dispatch<SetStateAction<number[]>>;
};

export function ParameterList({
  algorithm,
  depth,
  running,
  gammas,
  betas,
  thetas,
  setGammas,
  setBetas,
  setThetas,
}: ParameterListProps): JSX.Element {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-300">Parameters</h2>

      <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
        {algorithm === "qaoa"
          ? Array.from({ length: depth }, (_, i) => (
              <div key={`qaoa-param-${i}`} className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-neutral-400">
                  gamma[{i}]
                  <input
                    type="number"
                    step="0.01"
                    value={gammas[i] ?? 0}
                    disabled={running}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next)) return;
                      setGammas((prev) => {
                        const copy = [...prev];
                        copy[i] = next;
                        return copy;
                      });
                    }}
                    className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 outline-none ring-cyan-400 focus:ring-2 disabled:opacity-50"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-neutral-400">
                  beta[{i}]
                  <input
                    type="number"
                    step="0.01"
                    value={betas[i] ?? 0}
                    disabled={running}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next)) return;
                      setBetas((prev) => {
                        const copy = [...prev];
                        copy[i] = next;
                        return copy;
                      });
                    }}
                    className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 outline-none ring-cyan-400 focus:ring-2 disabled:opacity-50"
                  />
                </label>
              </div>
            ))
          : Array.from({ length: depth * 2 }, (_, i) => (
              <label key={`vqe-param-${i}`} className="flex flex-col gap-1 text-xs text-neutral-400">
                theta[{i}]
                <input
                  type="number"
                  step="0.01"
                  value={thetas[i] ?? 0}
                  disabled={running}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (!Number.isFinite(next)) return;
                    setThetas((prev) => {
                      const copy = [...prev];
                      copy[i] = next;
                      return copy;
                    });
                  }}
                  className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 outline-none ring-cyan-400 focus:ring-2 disabled:opacity-50"
                />
              </label>
            ))}
      </div>
    </section>
  );
}
