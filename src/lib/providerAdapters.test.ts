import { afterEach, describe, expect, it } from "vitest";
import { buildQaoaExecutionCircuit, buildVqeExecutionCircuit } from "./algorithms";
import {
  getExecutionProviderAdapter,
  getExecutionProviderAdapterForTarget,
  resetIonQProviderTransport,
  setIonQProviderTransport,
  type IonQProviderTransport,
} from "./providerAdapters";

const makeQaoaRequest = () => ({
  targetId: "dense-cpu" as const,
  circuit: buildQaoaExecutionCircuit(2, [[0, 1]], [], []),
  algorithm: "qaoa" as const,
  shots: 4,
  nodeCount: 2,
  edges: ["0-1"],
  gammas: [],
  betas: [],
});

const makeVqeRequest = () => ({
  targetId: "ionq-simulator" as const,
  circuit: buildVqeExecutionCircuit([]),
  algorithm: "vqe" as const,
  shots: 32,
  thetas: [],
  molecule: "H2_0.74" as const,
});

afterEach(() => {
  resetIonQProviderTransport();
});

describe("providerAdapters", () => {
  it("resolves adapters by provider and backend target", () => {
    expect(getExecutionProviderAdapter("local").provider).toBe("local");
    expect(getExecutionProviderAdapter("ionq").provider).toBe("ionq");
    expect(getExecutionProviderAdapterForTarget("dense-cpu").provider).toBe("local");
    expect(getExecutionProviderAdapterForTarget("ionq-qpu").provider).toBe("ionq");
  });

  it("submits local jobs through the local adapter as immediate completions", () => {
    const adapter = getExecutionProviderAdapter("local");
    const job = adapter.submitSamplingJob(makeQaoaRequest(), "2026-04-02T12:00:00.000Z");

    expect(job.status).toBe("completed");
    expect(job.queueBehavior).toBe("instant");
    expect(job.result?.bitstrings).toHaveLength(4);
    expect(job.submittedAt).toBe("2026-04-02T12:00:00.000Z");
  });

  it("stores the provider job identifier when IonQ accepts a submission", () => {
    const transport: IonQProviderTransport = {
      provider: "ionq",
      submitSamplingJob() {
        return {
          provider: "ionq",
          jobId: "ionq_job_123",
          status: "submitted",
          statusDetail: "IonQ accepted the job.",
        };
      },
      getJobStatus() {
        throw new Error("getJobStatus should not be called in this test.");
      },
    };
    setIonQProviderTransport(transport);

    const adapter = getExecutionProviderAdapter("ionq");
    const job = adapter.submitSamplingJob(makeVqeRequest(), "2026-04-02T12:00:00.000Z");

    expect(job.status).toBe("queued");
    expect(job.queueBehavior).toBe("provider-queue");
    expect(job.statusDetail).toBe("IonQ accepted the job.");
    expect(job.polling.externalJobId).toBe("ionq_job_123");
    expect(job.polling.providerStatus).toBe("submitted");
  });

  it("maps IonQ ready status into the internal queued lifecycle", () => {
    const transport: IonQProviderTransport = {
      provider: "ionq",
      submitSamplingJob() {
        return {
          provider: "ionq",
          jobId: "ionq_job_123",
          status: "submitted",
        };
      },
      getJobStatus() {
        return {
          provider: "ionq",
          jobId: "ionq_job_123",
          status: "ready",
          statusDetail: "IonQ has accepted the job but has not started execution yet.",
        };
      },
    };
    setIonQProviderTransport(transport);

    const adapter = getExecutionProviderAdapter("ionq");
    const queuedJob = adapter.submitSamplingJob(makeVqeRequest(), "2026-04-02T12:00:00.000Z");
    const updatedJob = adapter.pollJob(queuedJob, "2026-04-02T12:30:00.000Z");

    expect(updatedJob.status).toBe("queued");
    expect(updatedJob.statusDetail).toMatch(/has accepted the job/i);
    expect(updatedJob.polling.attemptCount).toBe(1);
    expect(updatedJob.polling.externalJobId).toBe("ionq_job_123");
    expect(updatedJob.polling.providerStatus).toBe("ready");
    expect(updatedJob.polling.nextSuggestedPollAt).toBe("2026-04-02T13:00:00.000Z");
  });

  it("maps IonQ started status into the internal running lifecycle", () => {
    const transport: IonQProviderTransport = {
      provider: "ionq",
      submitSamplingJob() {
        return {
          provider: "ionq",
          jobId: "ionq_job_123",
          status: "submitted",
        };
      },
      getJobStatus() {
        return {
          provider: "ionq",
          jobId: "ionq_job_123",
          status: "started",
          statusDetail: "IonQ started execution on the selected backend.",
        };
      },
    };
    setIonQProviderTransport(transport);

    const adapter = getExecutionProviderAdapter("ionq");
    const queuedJob = adapter.submitSamplingJob(makeVqeRequest(), "2026-04-02T12:00:00.000Z");
    const runningJob = adapter.pollJob(queuedJob, "2026-04-02T12:30:00.000Z");

    expect(runningJob.status).toBe("running");
    expect(runningJob.startedAt).toBe("2026-04-02T12:30:00.000Z");
    expect(runningJob.polling.attemptCount).toBe(1);
    expect(runningJob.polling.externalJobId).toBe("ionq_job_123");
    expect(runningJob.polling.providerStatus).toBe("started");
  });

  it("ingests completed provider payloads into the internal job result shape", () => {
    const transport: IonQProviderTransport = {
      provider: "ionq",
      submitSamplingJob() {
        return {
          provider: "ionq",
          jobId: "ionq_job_123",
          status: "submitted",
        };
      },
      getJobStatus() {
        return {
          provider: "ionq",
          jobId: "ionq_job_123",
          status: "completed",
          statusDetail: "IonQ completed the remote execution job.",
          result: {
            estimate: -1.2345,
            totalShotsUsed: 64,
            bitstrings: ["00", "11", "00"],
          },
        };
      },
    };
    setIonQProviderTransport(transport);

    const adapter = getExecutionProviderAdapter("ionq");
    const queuedJob = adapter.submitSamplingJob(makeVqeRequest(), "2026-04-02T12:00:00.000Z");
    const completedJob = adapter.pollJob(queuedJob, "2026-04-02T14:30:00.000Z");

    expect(completedJob.status).toBe("completed");
    expect(completedJob.completedAt).toBe("2026-04-02T14:30:00.000Z");
    expect(completedJob.result).toEqual({
      estimate: -1.2345,
      totalShotsUsed: 64,
      bitstrings: ["00", "11", "00"],
    });
    expect(completedJob.polling.resumable).toBe(false);
    expect(completedJob.polling.providerStatus).toBe("completed");
  });

  it("maps failed provider statuses into failed jobs with surfaced provider errors", () => {
    const transport: IonQProviderTransport = {
      provider: "ionq",
      submitSamplingJob() {
        return {
          provider: "ionq",
          jobId: "ionq_job_123",
          status: "submitted",
        };
      },
      getJobStatus() {
        return {
          provider: "ionq",
          jobId: "ionq_job_123",
          status: "failed",
          statusDetail: "IonQ rejected the job after validation.",
          errorMessage: "Unsupported gate set for target backend.",
        };
      },
    };
    setIonQProviderTransport(transport);

    const adapter = getExecutionProviderAdapter("ionq");
    const queuedJob = adapter.submitSamplingJob(makeVqeRequest(), "2026-04-02T12:00:00.000Z");
    const failedJob = adapter.pollJob(queuedJob, "2026-04-02T12:45:00.000Z");

    expect(failedJob.status).toBe("failed");
    expect(failedJob.statusDetail).toBe("IonQ rejected the job after validation.");
    expect(failedJob.errorMessage).toBe("Unsupported gate set for target backend.");
    expect(failedJob.polling.resumable).toBe(false);
    expect(failedJob.polling.providerStatus).toBe("failed");
  });
});
