import { describe, expect, it } from "vitest";
import { buildQaoaExecutionCircuit, buildVqeExecutionCircuit } from "./algorithms";
import {
  loadExecutionJobs,
  markExecutionJobFailed,
  pollExecutionJobs,
  retryExecutionJob,
  saveExecutionJobs,
  submitSamplingExecutionJob,
} from "./executionJobs";

describe("executionJobs", () => {
  it("completes local dense-cpu sampling jobs immediately", () => {
    const circuit = buildQaoaExecutionCircuit(2, [[0, 1]], [], []);
    const job = submitSamplingExecutionJob({
      targetId: "dense-cpu",
      circuit,
      algorithm: "qaoa",
      shots: 4,
      nodeCount: 2,
      edges: ["0-1"],
      gammas: [],
      betas: [],
    });

    expect(job.status).toBe("completed");
    expect(job.queueBehavior).toBe("instant");
    expect(job.result?.bitstrings).toHaveLength(4);
    expect(job.statusDetail).toMatch(/completed immediately/i);
  });

  it("queues remote provider jobs instead of pretending to execute them locally", () => {
    const circuit = buildVqeExecutionCircuit([]);
    const job = submitSamplingExecutionJob({
      targetId: "ionq-simulator",
      circuit,
      algorithm: "vqe",
      shots: 32,
      thetas: [],
      molecule: "H2_0.74",
    });

    expect(job.status).toBe("queued");
    expect(job.queueBehavior).toBe("provider-queue");
    expect(job.result).toBeUndefined();
    expect(job.statusDetail).toMatch(/provider queue/i);
    expect(job.polling.attemptCount).toBe(0);
    expect(job.polling.resumable).toBe(true);
    expect(job.polling.providerStatus).toBe("submitted");
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

  it("maps resumable remote jobs through queued provider status before they start running", () => {
    const circuit = buildVqeExecutionCircuit([]);
    const queuedJob = submitSamplingExecutionJob({
      targetId: "ionq-qpu",
      circuit,
      algorithm: "vqe",
      shots: 32,
      thetas: [],
      molecule: "H2_0.74",
    });

    const [readyJob] = pollExecutionJobs([queuedJob], "2026-04-02T12:00:00.000Z");
    const [runningJob] = pollExecutionJobs([readyJob!], "2026-04-02T13:00:00.000Z");

    expect(readyJob?.status).toBe("queued");
    expect(readyJob?.polling.providerStatus).toBe("ready");
    expect(runningJob?.status).toBe("running");
    expect(runningJob?.polling.attemptCount).toBe(2);
    expect(runningJob?.polling.lastAttemptedAt).toBe("2026-04-02T13:00:00.000Z");
    expect(runningJob?.polling.externalJobId).toMatch(/^ionq_/);
    expect(runningJob?.polling.providerStatus).toBe("started");
  });

  it("can mark running jobs as failed and retry them", () => {
    const circuit = buildVqeExecutionCircuit([]);
    const queuedJob = submitSamplingExecutionJob({
      targetId: "ionq-simulator",
      circuit,
      algorithm: "vqe",
      shots: 16,
      thetas: [],
      molecule: "H2_0.74",
    });

    const [runningJob] = pollExecutionJobs([queuedJob], "2026-04-02T12:00:00.000Z");
    const failedJob = markExecutionJobFailed(runningJob!, "Provider timeout", "2026-04-02T13:00:00.000Z");
    const retriedJob = retryExecutionJob(failedJob, "2026-04-02T14:00:00.000Z");

    expect(failedJob.status).toBe("failed");
    expect(failedJob.errorMessage).toBe("Provider timeout");
    expect(retriedJob.status).toBe("queued");
    expect(retriedJob.polling.retryCount).toBe(1);
    expect(retriedJob.errorMessage).toBeUndefined();
    expect(retriedJob.polling.attemptCount).toBe(0);
    expect(retriedJob.polling.providerStatus).toBeUndefined();
    expect(retriedJob.statusDetail).toMatch(/re-queued/i);
  });
});
