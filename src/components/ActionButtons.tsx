type ActionButtonsProps = {
  running: boolean;
  onToggleRun: () => void;
  onReset: () => void;
};

export function ActionButtons({ running, onToggleRun, onReset }: ActionButtonsProps): JSX.Element {
  return (
    <section className="grid grid-cols-2 gap-2">
      <button
        onClick={onToggleRun}
        className={`rounded-md px-3 py-2 text-sm font-medium ${
          running
            ? "border border-red-700 bg-red-900/40 text-red-200 hover:bg-red-900/60"
            : "border border-cyan-700 bg-cyan-900/40 text-cyan-200 hover:bg-cyan-900/60"
        }`}
      >
        {running ? "Stop Optimizer" : "Start Optimizer"}
      </button>
      <button
        onClick={onReset}
        className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm font-medium hover:bg-neutral-700"
      >
        Reset Simulation
      </button>
    </section>
  );
}
