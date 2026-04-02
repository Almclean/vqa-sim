import type { BackendKind, ExecutableCircuit, ExecutorCapability } from "./circuitExecutor";

export type BackendProvider = "local" | "ionq";

export type BackendTargetId = BackendKind | "ionq-simulator" | "ionq-qpu";

export type BackendImplementationStatus = "implemented" | "planned";

export type BackendExecutionMode = "local-sync" | "remote-job";

export type BackendExecutionIntent = "expectation-values" | "shot-sampling" | "state-vector";

export type BackendTargetDescriptor = {
  id: BackendTargetId;
  label: string;
  provider: BackendProvider;
  implementationStatus: BackendImplementationStatus;
  executionMode: BackendExecutionMode;
  supportedIntents: readonly BackendExecutionIntent[];
  executorCapabilities: readonly ExecutorCapability[];
  requiresProviderAdapter: boolean;
  notes: string;
};

export type BackendExecutionPlan =
  | {
      kind: "local-executor";
      backend: BackendKind;
      intent: BackendExecutionIntent;
    }
  | {
      kind: "remote-job";
      target: Exclude<BackendTargetId, BackendKind>;
      provider: Exclude<BackendProvider, "local">;
      intent: BackendExecutionIntent;
      requiresProviderAdapter: true;
    };

const BACKEND_TARGETS: readonly BackendTargetDescriptor[] = [
  {
    id: "dense-cpu",
    label: "Dense CPU Simulator",
    provider: "local",
    implementationStatus: "implemented",
    executionMode: "local-sync",
    supportedIntents: ["expectation-values", "shot-sampling", "state-vector"],
    executorCapabilities: ["ideal-execution", "expectation-values", "shot-sampling", "state-vector"],
    requiresProviderAdapter: false,
    notes: "Reference in-process backend used for exact evaluation, sampling, and state-vector inspection.",
  },
  {
    id: "ionq-simulator",
    label: "IonQ Simulator",
    provider: "ionq",
    implementationStatus: "planned",
    executionMode: "remote-job",
    supportedIntents: ["shot-sampling"],
    executorCapabilities: [],
    requiresProviderAdapter: true,
    notes: "Planned remote provider target. Requests should flow through a provider adapter and async job lifecycle.",
  },
  {
    id: "ionq-qpu",
    label: "IonQ QPU",
    provider: "ionq",
    implementationStatus: "planned",
    executionMode: "remote-job",
    supportedIntents: ["shot-sampling"],
    executorCapabilities: [],
    requiresProviderAdapter: true,
    notes: "Planned hardware target. Keep the abstraction shot-based and job-oriented rather than state-vector oriented.",
  },
] as const;

export const listBackendTargets = (): readonly BackendTargetDescriptor[] => BACKEND_TARGETS;

export const getBackendTargetDescriptor = (targetId: BackendTargetId): BackendTargetDescriptor => {
  const descriptor = BACKEND_TARGETS.find((target) => target.id === targetId);
  if (!descriptor) {
    throw new Error(`Unknown backend target "${targetId}".`);
  }
  return descriptor;
};

export const isImplementedBackendTarget = (targetId: BackendTargetId): targetId is BackendKind =>
  getBackendTargetDescriptor(targetId).implementationStatus === "implemented";

export const supportsExecutionIntent = (targetId: BackendTargetId, intent: BackendExecutionIntent): boolean =>
  getBackendTargetDescriptor(targetId).supportedIntents.includes(intent);

export const canBackendTargetAcceptCircuit = (
  targetId: BackendTargetId,
  circuit: ExecutableCircuit,
): { supported: boolean; reason?: string } => {
  const descriptor = getBackendTargetDescriptor(targetId);

  if (circuit.qubitCount < 1) {
    return {
      supported: false,
      reason: "Backend targets expect at least one qubit in the executable circuit.",
    };
  }

  if (descriptor.requiresProviderAdapter) {
    return {
      supported: true,
      reason: "Execution requires provider-specific transpilation and remote job submission.",
    };
  }

  return { supported: true };
};

export const planBackendExecution = (
  targetId: BackendTargetId,
  intent: BackendExecutionIntent,
): BackendExecutionPlan => {
  const descriptor = getBackendTargetDescriptor(targetId);

  if (!supportsExecutionIntent(targetId, intent)) {
    throw new Error(`Backend target "${targetId}" does not support execution intent "${intent}".`);
  }

  if (descriptor.executionMode === "local-sync") {
    return {
      kind: "local-executor",
      backend: targetId as BackendKind,
      intent,
    };
  }

  return {
    kind: "remote-job",
    target: targetId as Exclude<BackendTargetId, BackendKind>,
    provider: descriptor.provider as Exclude<BackendProvider, "local">,
    intent,
    requiresProviderAdapter: true,
  };
};
