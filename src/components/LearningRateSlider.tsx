import type { Algorithm } from "../types";

type LearningRateSliderProps = {
  algorithm: Algorithm;
  learningRate: number;
  effectiveLearningRate?: number;
  onChange: (learningRate: number) => void;
};

export function LearningRateSlider({
  algorithm,
  learningRate,
  effectiveLearningRate,
  onChange,
}: LearningRateSliderProps): JSX.Element {
  const recommendation = algorithm === "qaoa" ? "Recommended ~0.05" : "Recommended ~0.02";

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-300">
        Learning Rate ({algorithm.toUpperCase()})
      </h2>
      <input
        type="range"
        min={0.01}
        max={0.4}
        step={0.01}
        value={learningRate}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-400"
      />
      <div className="text-xs text-neutral-400">
        Optimizer step size: {learningRate.toFixed(2)} • {recommendation}
      </div>
      {effectiveLearningRate !== undefined ? (
        <div className="text-xs text-emerald-300">Effective now: {effectiveLearningRate.toFixed(4)}</div>
      ) : null}
    </section>
  );
}
