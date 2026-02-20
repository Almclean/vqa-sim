export type VqeEarlyStopConfig = {
  enabled: boolean;
  deltaThreshold: number;
  patience: number;
  minIterations: number;
};

type VqeEarlyStoppingControlsProps = {
  config: VqeEarlyStopConfig;
  onChange: (next: VqeEarlyStopConfig) => void;
};

export function VqeEarlyStoppingControls({ config, onChange }: VqeEarlyStoppingControlsProps): JSX.Element {
  return (
    <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-300">VQE Early Stop</h3>
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
        Delta Threshold
        <input
          type="number"
          min={0.000001}
          step={0.000001}
          value={config.deltaThreshold}
          onChange={(e) => onChange({ ...config, deltaThreshold: Math.max(0.000001, Number(e.target.value) || 0.000001) })}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-neutral-400">
          Patience: {config.patience}
          <input
            type="range"
            min={5}
            max={120}
            step={1}
            value={config.patience}
            onChange={(e) => onChange({ ...config, patience: Number(e.target.value) })}
            className="mt-1 w-full accent-emerald-400"
          />
        </label>
        <label className="block text-xs text-neutral-400">
          Min Iter: {config.minIterations}
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={config.minIterations}
            onChange={(e) => onChange({ ...config, minIterations: Number(e.target.value) })}
            className="mt-1 w-full accent-emerald-400"
          />
        </label>
      </div>
    </section>
  );
}
