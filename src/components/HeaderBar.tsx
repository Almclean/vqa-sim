import type { Algorithm } from "../types";

type HeaderBarProps = {
  algorithm: Algorithm;
  onAlgorithmChange: (next: Algorithm) => void;
};

export function HeaderBar({ algorithm, onAlgorithmChange }: HeaderBarProps): JSX.Element {
  return (
    <header className="mb-4 flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-wide">Variational Quantum Algorithm Simulator</h1>
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Ion Trap Native Gates: Rx, Ry, XX</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md border border-cyan-700/60 bg-cyan-900/30 px-3 py-1 text-xs font-medium uppercase tracking-wide text-cyan-300">
          Hardware: Ion Trap
        </span>
        <select
          value={algorithm}
          onChange={(e) => onAlgorithmChange(e.target.value as Algorithm)}
          className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none ring-cyan-400 transition focus:ring-2"
        >
          <option value="qaoa">QAOA (MaxCut)</option>
          <option value="vqe">VQE (Chemistry)</option>
        </select>
      </div>
    </header>
  );
}
