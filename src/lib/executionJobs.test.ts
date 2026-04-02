import { describe, expect, it } from "vitest";
import { buildQaoaExecutionCircuit, buildVqeExecutionCircuit } from "./algorithms";
import {
  loadExecutionJobs,
  markExecutionJobFailed,
  pollExecutionJobs,
  retryExecutionJob,
  retryExecutionJobInHistory,
  saveExecutionJobs,
  submitSamplingExecutionJob,
} from "./executionJobs";
import type { BackendTargetId } from "./backendTargets";
import type { ResolvedProviderAuth } from "./providerAuth";

const resolveProviderAuth = (targetId: BackendTargetId): ResolvedProviderAuth =>
  targetId === "dense-cpu"
    ? { provider: "local", mode: "not-required" }
    : { provider: "ionq", mode: "browser-session", apiKey: "test-ionq-key" };

describe("executionJobs", () => {
  it("completes local dense-cpu sampling jobs immediately", () => {
    const circuit = buildQaoaExecutionCircuit(2, [[0, 1]], [], []);
    const job = submitSamplingExecutionJob(
      {
        targetId: "dense-cpu",
        circuit,
        algorithm: "qaoa",
        shots: 4,
        nodeCount: 2,
        edges: ["0-1"],
        gammas: [],
        betas: [],
      },
      resolveProviderAuth("dense-cpu"),
    );

    expect(job.status).toBe("completed");
    expect(job.queueBehavior).toBe("instant");
    expect(job.result?.bitstrings).toHaveLength(4);
    expect(job.statusDetail).toMatch(/completed immediately/i);
  });

  it("queues remote provider jobs instead of pretending to execute them locally", () => {
    const circuit = buildVqeExecutionCircuit([]);
    const job = submitSamplingExecutionJob(
      {
        targetId: "ionq-simulator",
        circuit,
        algorithm: "vqe",
        shots: 32,
        thetas: [],
        molecule: "H2_0.74",
      },
      resolveProviderAuth("ionq-simulator"),
    );

    expect(job.status).toBe("queued");
    expect(job.queueBehavior).toBe("provider-queue");
    expect(job.result).toBeUndefined();
    expect(job.statusDetail).toMatch(/provider queue/i);
    expect(job.polling.attemptCount).toBe(0);
    expect(job.polling.resumable).toBe(true);
    expect(job.polling.providerStatus).toBe("submitted");
    expect(job.request?.algorithm).toBe("vqe");
  });

  it("persists and restores execution job history", () => {
    const jobs = [
      {
        id: "job_test",
        targetId: "dense-cpu" as const,
        targetLabel: "Dense CPU Simulator",
        algorithm: "qaoa" as const,
        intent: "shot-sampling" as const,
        status: "completed" as const,
        submittedAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
        startedAt: "2026-04-02T00:00:00.000Z",
        completedAt: "2026-04-02T00:00:00.000Z",
        shots: 64,
        queueBehavior: "instant" as const,
        statusDetail: "Completed immediately on Dense CPU Simulator.",
        polling: {
          attemptCount: 0,
          retryCount: 0,
          resumable: false,
        },
        request: {
          targetId: "dense-cpu" as const,
          circuit: buildQaoaExecutionCircuit(2, [[0, 1]], [], []),
          algorithm: "qaoa" as const,
          shots: 64,
          nodeCount: 2,
          edges: ["0-1"],
          gammas: [],
          betas: [],
        },
      },
    ];

    saveExecutionJobs(jobs);
    expect(loadExecutionJobs()).toEqual(jobs);
  });

  it("normalizes older persisted jobs that did not include polling metadata", () => {
    window.localStorage.setItem(
      "vqa-sim:execution-jobs",
      JSON.stringify([
        {
          id: "legacy_job",
          targetId: "ionq-simulator",
          targetLabel: "IonQ Simulator",
          algorithm: "qaoa",
          intent: "shot-sampling",
          status: "queued",
          submittedAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
          shots: 128,
          queueBehavior: "provider-queue",
          statusDetail: "Legacy queued job",
        },
      ]),
    );

    expect(loadExecutionJobs()[0]?.polling).toEqual({
      attemptCount: 0,
      retryCount: 0,
      resumable: true,
      nextSuggestedPollAt: "2026-04-02T00:15:00.000Z",
      providerStatus: undefined,
    });
  });

  it("resumes remote jobs through running, pending result retrieval, and final completion", () => {
    const circuit = buildVqeExecutionCircuit([]);
    const queuedJob = submitSamplingExecutionJob(
      {
        targetId: "ionq-qpu",
        circuit,
        algorithm: "vqe",
        shots: 32,
        thetas: [],
        molecule: "H2_0.74",
      },
      resolveProviderAuth("ionq-qpu"),
    );

    const [readyJob] = pollExecutionJobs([queuedJob], resolveProviderAuth, "2026-04-02T12:00:00.000Z");
    const [runningJob] = pollExecutionJobs([readyJob!], resolveProviderAuth, "2026-04-02T13:00:00.000Z");
    const [retrievalPendingJob] = pollExecutionJobs([runningJob!], resolveProviderAuth, "2026-04-02T14:00:00.000Z");
    const [completedJob] = pollExecutionJobs([retrievalPendingJob!], resolveProviderAuth, "2026-04-02T15:00:00.000Z");

    expect(readyJob?.status).toBe("queued");
    expect(readyJob?.polling.providerStatus).toBe("ready");
    expect(runningJob?.status).toBe("running");
    expect(runningJob?.polling.attemptCount).toBe(2);
    expect(runningJob?.polling.lastAttemptedAt).toBe("2026-04-02T13:00:00.000Z");
    expect(runningJob?.polling.externalJobId).toMatch(/^ionq_/);
    expect(runningJob?.polling.providerStatus).toBe("started");
    expect(retrievalPendingJob?.status).toBe("running");
    expect(retrievalPendingJob?.polling.providerStatus).toBe("completed");
    expect(retrievalPendingJob?.polling.resultRetrievalState).toBe("pending");
    expect(completedJob?.status).toBe("completed");
    expect(completedJob?.polling.resultRetrievalState).toBe("retrieved");
    expect(completedJob?.result?.bitstrings.length).toBeGreaterThan(0);
  });

  it("can retry failed jobs without overwriting the prior failed attempt", () => {
    const circuit = buildVqeExecutionCircuit([]);
    const queuedJob = submitSamplingExecutionJob(
      {
        targetId: "ionq-simulator",
        circuit,
        algorithm: "vqe",
        shots: 16,
        thetas: [],
        molecule: "H2_0.74",
      },
      resolveProviderAuth("ionq-simulator"),
    );

    const [runningJob] = pollExecutionJobs([queuedJob], resolveProviderAuth, "2026-04-02T12:00:00.000Z");
    const failedJob = markExecutionJobFailed(runningJob!, "Provider timeout", "2026-04-02T13:00:00.000Z");
    const { archivedJob, retriedJob } = retryExecutionJob(failedJob, resolveProviderAuth, "2026-04-02T14:00:00.000Z");
    const history = retryExecutionJobInHistory([failedJob], failedJob.id, resolveProviderAuth, "2026-04-02T14:00:00.000Z");

    expect(failedJob.status).toBe("failed");
    expect(failedJob.errorMessage).toBe("Provider timeout");
    expect(archivedJob.supersededByJobId).toBe(retriedJob.id);
    expect(retriedJob.status).toBe("queued");
    expect(retriedJob.polling.retryCount).toBe(1);
    expect(retriedJob.errorMessage).toBeUndefined();
    expect(retriedJob.polling.attemptCount).toBe(0);
    expect(retriedJob.polling.providerStatus).toBe("submitted");
    expect(retriedJob.sourceJobId).toBe(failedJob.id);
    expect(history[0]?.sourceJobId).toBe(failedJob.id);
    expect(history[1]?.supersededByJobId).toBe(history[0]?.id);
  });

  it("fails remote polling cleanly when the auth required for that provider is missing", () => {
    const circuit = buildVqeExecutionCircuit([]);
    const queuedJob = submitSamplingExecutionJob(
      {
        targetId: "ionq-simulator",
        circuit,
        algorithm: "vqe",
        shots: 16,
        thetas: [],
        molecule: "H2_0.74",
      },
      resolveProviderAuth("ionq-simulator"),
    );

    const [failedJob] = pollExecutionJobs(
      [queuedJob],
      () => ({ provider: "ionq", mode: "browser-session", apiKey: "" }),
      "2026-04-02T12:00:00.000Z",
    );

    expect(failedJob?.status).toBe("failed");
    expect(failedJob?.errorMessage).toMatch(/requires an api key/i);
  });
});
