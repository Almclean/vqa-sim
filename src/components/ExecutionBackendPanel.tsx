import {
  getBackendTargetDescriptor,
  listBackendTargets,
  type BackendTargetId,
  type BackendTargetDescriptor,
} from "../lib/backendTargets";

type ExecutionBackendPanelProps = {
  executionTarget: BackendTargetId;
  ionqApiKey: string;
  onExecutionTargetChange: (target: BackendTargetId) => void;
  onIonqApiKeyChange: (apiKey: string) => void;
};

const formatIntentLabel = (intent: BackendTargetDescriptor["supportedIntents"][number]): string => {
  switch (intent) {
    case "expectation-values":
      return "Expectation values";
    case "shot-sampling":
      return "Shot sampling";
    case "state-vector":
      return "State vector";
    default:
      return intent;
  }
};

export function ExecutionBackendPanel({
  executionTarget,
  ionqApiKey,
  onExecutionTargetChange,
  onIonqApiKeyChange,
}: ExecutionBackendPanelProps): JSX.Element {
  const descriptor = getBackendTargetDescriptor(executionTarget);
  const isRemoteTarget = descriptor.executionMode === "remote-job";
  const targetOptions = listBackendTargets();

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-300">Execution Backend</h2>

      <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-300" htmlFor="execution-target">
            Execution target
          </label>
          <select
            id="execution-target"
            value={executionTarget}
            onChange={(event) => onExecutionTargetChange(event.target.value as BackendTargetId)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring-2"
          >
            {targetOptions.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
                {target.implementationStatus === "planned" ? " (planned)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-400">
          <span className="rounded-full border border-neutral-700 px-2 py-1">{descriptor.provider}</span>
          <span className="rounded-full border border-neutral-700 px-2 py-1">
            {descriptor.executionMode === "local-sync" ? "Local sync" : "Remote job"}
          </span>
          <span
            className={`rounded-full border px-2 py-1 ${
              descriptor.implementationStatus === "implemented"
                ? "border-emerald-700 text-emerald-300"
                : "border-amber-700 text-amber-300"
            }`}
          >
            {descriptor.implementationStatus}
          </span>
        </div>

        <p className="text-xs text-neutral-400">{descriptor.notes}</p>

        <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Supported intents</p>
          <p className="mt-2 text-sm text-neutral-200">
            {descriptor.supportedIntents.map((intent) => formatIntentLabel(intent)).join(", ")}
          </p>
        </div>

        {descriptor.provider === "ionq" ? (
          <div className="space-y-2 rounded-md border border-neutral-800 bg-neutral-900 p-3">
            <label className="block text-xs font-medium text-neutral-300" htmlFor="ionq-api-key">
              IonQ API key
            </label>
            <input
              id="ionq-api-key"
              type="password"
              value={ionqApiKey}
              onChange={(event) => onIonqApiKeyChange(event.target.value)}
              placeholder="Enter IonQ API key"
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-cyan-500"
            />
            <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
              <span>Stored locally in this browser until provider secret handling is added.</span>
              <span className={ionqApiKey ? "text-emerald-300" : "text-amber-300"}>
                {ionqApiKey ? "Configured" : "Missing"}
              </span>
            </div>
          </div>
        ) : null}

        <div className="rounded-md border border-cyan-900/60 bg-cyan-950/20 p-3 text-xs text-cyan-100">
          <p>Local dense CPU execution completes immediately, while remote targets submit provider-backed jobs into the shared queue.</p>
          {isRemoteTarget ? (
            <p className="mt-2 text-cyan-200/90">
              Remote provider status mapping is in place, but secure credential handling and full deferred result retrieval are
              still being tightened. Treat this flow as poll, resume, and revisit rather than a live blocking session.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
