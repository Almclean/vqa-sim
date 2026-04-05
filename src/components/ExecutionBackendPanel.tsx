import {
  getBackendTargetDescriptor,
  listBackendTargets,
  type BackendTargetId,
} from "../lib/backendTargets";
import type { IonQCredentialMode } from "../lib/backendPreferences";
import {
  getNoiseProfileDescriptor,
  listNoiseProfiles,
  type NoiseProfileId,
} from "../lib/noiseProfiles";

type ExecutionBackendPanelProps = {
  executionTarget: BackendTargetId;
  ionqCredentialMode: IonQCredentialMode;
  noiseProfileId: NoiseProfileId;
  depolarizingProbability: number;
  amplitudeDampingProbability: number;
  readoutErrorProbability: number;
  ionqApiKey: string;
  ionqAuthConfigured: boolean;
  onExecutionTargetChange: (target: BackendTargetId) => void;
  onIonqCredentialModeChange: (mode: IonQCredentialMode) => void;
  onNoiseProfileChange: (profileId: NoiseProfileId) => void;
  onDepolarizingProbabilityChange: (probability: number) => void;
  onAmplitudeDampingProbabilityChange: (probability: number) => void;
  onReadoutErrorProbabilityChange: (probability: number) => void;
  onIonqApiKeyChange: (apiKey: string) => void;
  onClearIonqApiKey: () => void;
};

export function ExecutionBackendPanel({
  executionTarget,
  ionqCredentialMode,
  noiseProfileId,
  depolarizingProbability,
  amplitudeDampingProbability,
  readoutErrorProbability,
  ionqApiKey,
  ionqAuthConfigured,
  onExecutionTargetChange,
  onIonqCredentialModeChange,
  onNoiseProfileChange,
  onDepolarizingProbabilityChange,
  onAmplitudeDampingProbabilityChange,
  onReadoutErrorProbabilityChange,
  onIonqApiKeyChange,
  onClearIonqApiKey,
}: ExecutionBackendPanelProps): JSX.Element {
  const descriptor = getBackendTargetDescriptor(executionTarget);
  const isRemoteTarget = descriptor.executionMode === "remote-job";
  const supportsNoiseControls = executionTarget === "density-cpu";
  const targetOptions = listBackendTargets();
  const noiseProfileOptions = listNoiseProfiles();
  const selectedNoiseProfile = getNoiseProfileDescriptor(noiseProfileId);
  const isCustomNoiseProfile = noiseProfileId === "custom";
  const ionqStatusCopy =
    ionqCredentialMode === "browser-session"
      ? ionqAuthConfigured
        ? "API key added for this tab."
        : "Add an API key to run IonQ jobs."
      : "Provider auth is handled outside the browser.";

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
              </option>
            ))}
          </select>
        </div>

        {supportsNoiseControls ? (
          <div className="space-y-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-300" htmlFor="noise-profile">
                Noise profile
              </label>
              <select
                id="noise-profile"
                value={noiseProfileId}
                onChange={(event) => onNoiseProfileChange(event.target.value as NoiseProfileId)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring-2"
              >
                {noiseProfileOptions.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </div>

            {noiseProfileId !== "ideal" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                  <div className="rounded-md border border-neutral-800 bg-neutral-950/80 px-2 py-2">
                    <div>Depol</div>
                    <div className="mt-1 font-mono text-neutral-200">
                      {(isCustomNoiseProfile
                        ? depolarizingProbability
                        : selectedNoiseProfile.settings.depolarizingProbability
                      ).toFixed(3)}
                    </div>
                  </div>
                  <div className="rounded-md border border-neutral-800 bg-neutral-950/80 px-2 py-2">
                    <div>T1</div>
                    <div className="mt-1 font-mono text-neutral-200">
                      {(isCustomNoiseProfile
                        ? amplitudeDampingProbability
                        : selectedNoiseProfile.settings.amplitudeDampingProbability
                      ).toFixed(3)}
                    </div>
                  </div>
                  <div className="rounded-md border border-neutral-800 bg-neutral-950/80 px-2 py-2">
                    <div>Readout</div>
                    <div className="mt-1 font-mono text-neutral-200">
                      {(isCustomNoiseProfile
                        ? readoutErrorProbability
                        : selectedNoiseProfile.settings.readoutErrorProbability
                      ).toFixed(3)}
                    </div>
                  </div>
                </div>

                {isCustomNoiseProfile ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-xs text-neutral-400">
                        <label htmlFor="depolarizing-probability">Depolarizing probability</label>
                        <span className="font-mono text-neutral-200">{depolarizingProbability.toFixed(3)}</span>
                      </div>
                      <input
                        id="depolarizing-probability"
                        type="range"
                        min={0}
                        max={0.2}
                        step={0.0025}
                        value={depolarizingProbability}
                        onChange={(event) => onDepolarizingProbabilityChange(Number.parseFloat(event.target.value))}
                        className="w-full accent-cyan-400"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-xs text-neutral-400">
                        <label htmlFor="amplitude-damping-probability">Amplitude damping</label>
                        <span className="font-mono text-neutral-200">{amplitudeDampingProbability.toFixed(3)}</span>
                      </div>
                      <input
                        id="amplitude-damping-probability"
                        type="range"
                        min={0}
                        max={0.2}
                        step={0.0025}
                        value={amplitudeDampingProbability}
                        onChange={(event) =>
                          onAmplitudeDampingProbabilityChange(Number.parseFloat(event.target.value))
                        }
                        className="w-full accent-cyan-400"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-xs text-neutral-400">
                        <label htmlFor="readout-error-probability">Readout error</label>
                        <span className="font-mono text-neutral-200">{readoutErrorProbability.toFixed(3)}</span>
                      </div>
                      <input
                        id="readout-error-probability"
                        type="range"
                        min={0}
                        max={0.2}
                        step={0.0025}
                        value={readoutErrorProbability}
                        onChange={(event) => onReadoutErrorProbabilityChange(Number.parseFloat(event.target.value))}
                        className="w-full accent-cyan-400"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {descriptor.provider === "ionq" ? (
          <div className="space-y-2 rounded-md border border-neutral-800 bg-neutral-900 p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-300" htmlFor="ionq-credential-mode">
                IonQ auth mode
              </label>
              <select
                id="ionq-credential-mode"
                value={ionqCredentialMode}
                onChange={(event) => onIonqCredentialModeChange(event.target.value as IonQCredentialMode)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring-2"
              >
                <option value="browser-session">Browser session key</option>
                <option value="server-managed">Server-managed provider auth</option>
              </select>
            </div>

            {ionqCredentialMode === "browser-session" ? (
              <>
                <label className="block text-xs font-medium text-neutral-300" htmlFor="ionq-api-key">
                  IonQ API key
                </label>
                <input
                  id="ionq-api-key"
                  type="password"
                  value={ionqApiKey}
                  onChange={(event) => onIonqApiKeyChange(event.target.value)}
                  placeholder="Enter IonQ API key for this tab"
                  className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-cyan-500"
                />
                <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
                  <span>Saved in this tab only.</span>
                  <button
                    type="button"
                    onClick={onClearIonqApiKey}
                    className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-300 transition hover:bg-neutral-800"
                  >
                    Clear Key
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-neutral-800 bg-neutral-950/70 p-3 text-xs text-neutral-400">
                Use your app or server to supply the IonQ key.
              </div>
            )}

            <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
              <span>{ionqStatusCopy}</span>
              <span className={ionqAuthConfigured ? "text-emerald-300" : "text-amber-300"}>
                {ionqAuthConfigured ? "Configured" : "Missing"}
              </span>
            </div>
          </div>
        ) : null}

        {isRemoteTarget ? (
          <p className="text-xs text-cyan-200">Remote runs show up in Execution Jobs and may finish later.</p>
        ) : null}
      </div>
    </section>
  );
}
