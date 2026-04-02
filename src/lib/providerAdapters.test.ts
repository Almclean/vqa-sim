import { describe, expect, it } from "vitest";
import { buildQaoaExecutionCircuit, buildVqeExecutionCircuit } from "./algorithms";
import { getExecutionProviderAdapter, getExecutionProviderAdapterForTarget } from "./providerAdapters";

describe("providerAdapters", () => {
  it("resolves adapters by provider and backend target", () => {
    expect(getExecutionProviderAdapter("local").provider).toBe("local");
    expect(getExecutionProviderAdapter("ionq").provider).toBe("ionq");
    expect(getExecutionProviderAdapterForTarget("dense-cpu").provider).toBe("local");
    expect(getExecutionProviderAdapterForTarget("ionq-qpu").provider).toBe("ionq");
  });

  it("submits local jobs through the local adapter as immediate completions", () => {
    const adapter = getExecutionProviderAdapter("local");
    const job = adapter.submitSamplingJob(
      {
        targetId: "dense-cpu",
        circuit: buildQaoaExecutionCircuit(2, [[0, 1]], [], []),
        algorithm: "qaoa",
        shots: 4,
        nodeCount: 2,
        edges: ["0-1"],
        gammas: [],
        betas: [],
      },
      "2026-04-02T12:00:00.000Z",
    );

    expect(job.status).toBe("completed");
    expect(job.queueBehavior).toBe("instant");
    expect(job.result?.bitstrings).toHaveLength(4);
    expect(job.submittedAt).toBe("2026-04-02T12:00:00.000Z");
  });

  it("submits remote jobs through the IonQ adapter as queued work", () => {
    const adapter = getExecutionProviderAdapter("ionq");
    const job = adapter.submitSamplingJob(
      {
        targetId: "ionq-simulator",
        circuit: buildVqeExecutionCircuit([]),
        algorithm: "vqe",
        shots: 32,
        thetas: [],
        molecule: "H2_0.74",
      },
      "2026-04-02T12:00:00.000Z",
    );

    expect(job.status).toBe("queued");
    expect(job.queueBehavior).toBe("provider-queue");
    expect(job.polling.nextSuggestedPollAt).toBe("2026-04-02T12:15:00.000Z");
  });

  it("polls queued remote jobs into a running state", () => {
    const adapter = getExecutionProviderAdapter("ionq");
    const queuedJob = adapter.submitSamplingJob(
      {
        targetId: "ionq-qpu",
        circuit: buildVqeExecutionCircuit([]),
        algorithm: "vqe",
        shots: 16,
        thetas: [],
        molecule: "H2_0.74",
      },
      "2026-04-02T12:00:00.000Z",
    );

    const runningJob = adapter.pollJob(queuedJob, "2026-04-02T12:30:00.000Z");

    expect(runningJob.status).toBe("running");
    expect(runningJob.startedAt).toBe("2026-04-02T12:30:00.000Z");
    expect(runningJob.polling.attemptCount).toBe(1);
    expect(runningJob.polling.externalJobId).toMatch(/^remote_/);
  });
});
