import { describe, expect, it } from "vitest";
import {
  canBackendTargetAcceptCircuit,
  getBackendTargetDescriptor,
  isImplementedBackendTarget,
  listBackendTargets,
  planBackendExecution,
  supportsExecutionIntent,
} from "./backendTargets";

describe("backendTargets", () => {
  it("lists implemented and planned backend targets", () => {
    expect(listBackendTargets().map((target) => target.id)).toEqual(["dense-cpu", "ionq-simulator", "ionq-qpu"]);
  });

  it("describes the local reference backend", () => {
    expect(getBackendTargetDescriptor("dense-cpu")).toEqual({
      id: "dense-cpu",
      label: "Dense CPU Simulator",
      provider: "local",
      implementationStatus: "implemented",
      executionMode: "local-sync",
      supportedIntents: ["expectation-values", "shot-sampling", "state-vector"],
      executorCapabilities: ["ideal-execution", "expectation-values", "shot-sampling", "state-vector"],
      requiresProviderAdapter: false,
      notes: "Reference in-process backend used for exact evaluation, sampling, and state-vector inspection.",
    });
  });

  it("marks IonQ targets as planned remote backends", () => {
    const ionqQpu = getBackendTargetDescriptor("ionq-qpu");

    expect(ionqQpu.provider).toBe("ionq");
    expect(ionqQpu.implementationStatus).toBe("planned");
    expect(ionqQpu.executionMode).toBe("remote-job");
    expect(ionqQpu.requiresProviderAdapter).toBe(true);
  });

  it("distinguishes implemented executor targets from planned provider targets", () => {
    expect(isImplementedBackendTarget("dense-cpu")).toBe(true);
    expect(isImplementedBackendTarget("ionq-simulator")).toBe(false);
    expect(isImplementedBackendTarget("ionq-qpu")).toBe(false);
  });

  it("tracks execution-intent support per target", () => {
    expect(supportsExecutionIntent("dense-cpu", "expectation-values")).toBe(true);
    expect(supportsExecutionIntent("dense-cpu", "state-vector")).toBe(true);
    expect(supportsExecutionIntent("ionq-simulator", "shot-sampling")).toBe(true);
    expect(supportsExecutionIntent("ionq-simulator", "expectation-values")).toBe(false);
    expect(supportsExecutionIntent("ionq-qpu", "state-vector")).toBe(false);
  });

  it("plans local execution for implemented simulator work", () => {
    expect(planBackendExecution("dense-cpu", "expectation-values")).toEqual({
      kind: "local-executor",
      backend: "dense-cpu",
      intent: "expectation-values",
    });
  });

  it("plans remote job execution for IonQ targets", () => {
    expect(planBackendExecution("ionq-qpu", "shot-sampling")).toEqual({
      kind: "remote-job",
      target: "ionq-qpu",
      provider: "ionq",
      intent: "shot-sampling",
      requiresProviderAdapter: true,
    });
  });

  it("rejects unsupported intents for remote provider targets", () => {
    expect(() => planBackendExecution("ionq-qpu", "state-vector")).toThrow(/does not support execution intent/i);
  });

  it("flags when a target needs provider-specific transpilation", () => {
    expect(
      canBackendTargetAcceptCircuit("ionq-simulator", {
        qubitCount: 2,
        operations: [{ kind: "xx", q1: 0, q2: 1, theta: Math.PI / 4 }],
      }),
    ).toEqual({
      supported: true,
      reason: "Execution requires provider-specific transpilation and remote job submission.",
    });
  });

  it("rejects empty circuits at the target-planning layer", () => {
    expect(
      canBackendTargetAcceptCircuit("dense-cpu", {
        qubitCount: 0,
        operations: [],
      }),
    ).toEqual({
      supported: false,
      reason: "Backend targets expect at least one qubit in the executable circuit.",
    });
  });
});
