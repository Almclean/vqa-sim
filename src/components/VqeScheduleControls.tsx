export type VqeDecayMode = "exponential" | "step";

export type VqeDecayConfig = {
  enabled: boolean;
  mode: VqeDecayMode;
  minLearningRate: number;
  expGamma: number;
  stepEvery: number;
  stepFactor: number;
};

type VqeScheduleControlsProps = {
  config: VqeDecayConfig;
  onChange: (next: VqeDecayConfig) => void;
};

export function VqeScheduleControls({ config, onChange }: VqeScheduleControlsProps): JSX.Element {
  return (
    <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-300">VQE LR Schedule</h3>
        <label className="flex items-center gap-2 text-xs text-neutral-300">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
            className="accent-emerald-400"
          />
          Enabled
        </label>
      </div>

      <label className="block text-xs text-neutral-400">
        Mode
        <select
          value={config.mode}
          onChange={(e) => onChange({ ...config, mode: e.target.value as VqeDecayMode })}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
        >
          <option value="exponential">Exponential</option>
          <option value="step">Step</option>
        </select>
      </label>

      <label className="block text-xs text-neutral-400">
        Min LR: {config.minLearningRate.toFixed(3)}
        <input
          type="range"
          min={0.001}
          max={0.08}
          step={0.001}
          value={config.minLearningRate}
          onChange={(e) => onChange({ ...config, minLearningRate: Number(e.target.value) })}
          className="mt-1 w-full accent-emerald-400"
        />
      </label>

      {config.mode === "exponential" ? (
        <label className="block text-xs text-neutral-400">
          Gamma: {config.expGamma.toFixed(3)}
          <input
            type="range"
            min={0.95}
            max={0.999}
            step={0.001}
            value={config.expGamma}
            onChange={(e) => onChange({ ...config, expGamma: Number(e.target.value) })}
            className="mt-1 w-full accent-emerald-400"
          />
        </label>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-neutral-400">
            Step Every: {config.stepEvery}
            <input
              type="range"
              min={5}
              max={120}
              step={5}
              value={config.stepEvery}
              onChange={(e) => onChange({ ...config, stepEvery: Number(e.target.value) })}
              className="mt-1 w-full accent-emerald-400"
            />
          </label>
          <label className="block text-xs text-neutral-400">
            Step Factor: {config.stepFactor.toFixed(2)}
            <input
              type="range"
              min={0.5}
              max={0.99}
              step={0.01}
              value={config.stepFactor}
              onChange={(e) => onChange({ ...config, stepFactor: Number(e.target.value) })}
              className="mt-1 w-full accent-emerald-400"
            />
          </label>
        </div>
      )}
    </section>
  );
}
