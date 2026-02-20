type DepthSliderProps = {
  depth: number;
  running: boolean;
  onChange: (depth: number) => void;
};

export function DepthSlider({ depth, running, onChange }: DepthSliderProps): JSX.Element {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-300">Depth / Layers</h2>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={depth}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-cyan-400"
        disabled={running}
      />
      <div className="text-xs text-neutral-400">Layers: {depth}</div>
    </section>
  );
}
