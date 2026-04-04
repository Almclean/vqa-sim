import { canBackendTargetAcceptCircuit, type BackendTargetId } from "./backendTargets";
import type { ExecutableCircuit, NoiseModel } from "./circuitExecutor";
import { type MoleculeKey } from "../data/molecules";
import type { Algorithm } from "../types";
import { getExecutionProviderAdapterForTarget } from "./providerAdapters";
import { type ResolvedProviderAuth } from "./providerAuth";

export type ExecutionJobStatus = "queued" | "running" | "completed" | "failed";

export type ExecutionJobIntent = "shot-sampling";

export type SamplingExecutionJobRequest =
  | {
      targetId: BackendTargetId;
      circuit: ExecutableCircuit;
      algorithm: "qaoa";
      shots: number;
      noiseModel?: NoiseModel;
      nodeCount: number;
      edges: string[];
      gammas: number[];
      betas: number[];
    }
  | {
      targetId: BackendTargetId;
      circuit: ExecutableCircuit;
      algorithm: "vqe";
      shots: number;
      noiseModel?: NoiseModel;
      thetas: number[];
      molecule: MoleculeKey;
    };

export type SamplingExecutionJobResult = {
  estimate: number;
  totalShotsUsed: number;
  bitstrings: string[];
};

export type ExecutionResultRetrievalState = "pending" | "retrieved";

export type ExecutionPollingState = {
  attemptCount: number;
  retryCount: number;
  resumable: boolean;
  lastAttemptedAt?: string;
  nextSuggestedPollAt?: string;
  externalJobId?: string;
  providerStatus?: string;
  providerChildJobIds?: string[];
  resultRetrievalState?: ExecutionResultRetrievalState;
  resultRetrievalAttemptCount?: number;
  lastResultRetrievedAt?: string;
};

export type ExecutionJobRecord = {
  id: string;
  targetId: BackendTargetId;
  targetLabel: string;
  algorithm: Algorithm;
  intent: ExecutionJobIntent;
  status: ExecutionJobStatus;
  submittedAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  shots: number;
  queueBehavior: "instant" | "provider-queue";
  statusDetail: string;
  polling: ExecutionPollingState;
  request?: SamplingExecutionJobRequest;
  sourceJobId?: string;
  supersededByJobId?: string;
  result?: SamplingExecutionJobResult;
  errorMessage?: string;
};

const EXECUTION_JOBS_STORAGE_KEY = "vqa-sim:execution-jobs";
const MAX_PERSISTED_EXECUTION_JOBS = 24;

const addMinutesToIsoTimestamp = (timestamp: string, minutes: number): string => {
  const parsed = new Date(timestamp);
  parsed.setMinutes(parsed.getMinutes() + minutes);
  return parsed.toISOString();
};

const normalizeExecutionJobRecord = (job: Partial<ExecutionJobRecord>): ExecutionJobRecord | null => {
  if (typeof job.id !== "string") return null;
  if (typeof job.targetId !== "string") return null;
  if (typeof job.targetLabel !== "string") return null;
  if (job.algorithm !== "qaoa" && job.algorithm !== "vqe") return null;
  if (job.intent !== "shot-sampling") return null;
  if (job.status !== "queued" && job.status !== "running" && job.status !== "completed" && job.status !== "failed") return null;
  if (typeof job.submittedAt !== "string" || typeof job.updatedAt !== "string") return null;
  if (typeof job.shots !== "number") return null;
  if (job.queueBehavior !== "instant" && job.queueBehavior !== "provider-queue") return null;
  if (typeof job.statusDetail !== "string") return null;

  const fallbackPolling: ExecutionPollingState =
    job.queueBehavior === "provider-queue"
      ? {
          attemptCount: 0,
          retryCount: 0,
          resumable: true,
          nextSuggestedPollAt: addMinutesToIsoTimestamp(job.submittedAt, 15),
        }
      : { attemptCount: 0, retryCount: 0, resumable: false };
  const polling = job.polling ?? fallbackPolling;

  return {
    id: job.id,
    targetId: job.targetId,
    targetLabel: job.targetLabel,
    algorithm: job.algorithm,
    intent: job.intent,
    status: job.status,
    submittedAt: job.submittedAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    shots: job.shots,
    queueBehavior: job.queueBehavior,
    statusDetail: job.statusDetail,
    polling: {
      attemptCount: typeof polling.attemptCount === "number" ? polling.attemptCount : fallbackPolling.attemptCount,
      retryCount: typeof polling.retryCount === "number" ? polling.retryCount : fallbackPolling.retryCount,
      resumable: typeof polling.resumable === "boolean" ? polling.resumable : fallbackPolling.resumable,
      lastAttemptedAt: polling.lastAttemptedAt,
      nextSuggestedPollAt: polling.nextSuggestedPollAt,
      externalJobId: polling.externalJobId,
      providerStatus: typeof polling.providerStatus === "string" ? polling.providerStatus : undefined,
      providerChildJobIds: Array.isArray(polling.providerChildJobIds) ? polling.providerChildJobIds : undefined,
      resultRetrievalState:
        polling.resultRetrievalState === "pending" || polling.resultRetrievalState === "retrieved"
          ? polling.resultRetrievalState
          : undefined,
      resultRetrievalAttemptCount:
        typeof polling.resultRetrievalAttemptCount === "number" ? polling.resultRetrievalAttemptCount : undefined,
      lastResultRetrievedAt: polling.lastResultRetrievedAt,
    },
    request: job.request,
    sourceJobId: job.sourceJobId,
    supersededByJobId: job.supersededByJobId,
    result: job.result,
    errorMessage: job.errorMessage,
  };
};

export const loadExecutionJobs = (): ExecutionJobRecord[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(EXECUTION_JOBS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Partial<ExecutionJobRecord>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((job) => normalizeExecutionJobRecord(job))
      .filter((job): job is ExecutionJobRecord => job !== null);
  } catch {
    return [];
  }
};

export const saveExecutionJobs = (jobs: ExecutionJobRecord[]): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EXECUTION_JOBS_STORAGE_KEY, JSON.stringify(jobs.slice(0, MAX_PERSISTED_EXECUTION_JOBS)));
};

export const submitSamplingExecutionJob = async (
  request: SamplingExecutionJobRequest,
  providerAuth: ResolvedProviderAuth,
): Promise<ExecutionJobRecord> => {
  const acceptance = canBackendTargetAcceptCircuit(request.targetId, request.circuit);
  if (!acceptance.supported) {
    throw new Error(acceptance.reason ?? `Execution target "${request.targetId}" cannot accept the current circuit.`);
  }

  const timestamp = new Date().toISOString();
  return getExecutionProviderAdapterForTarget(request.targetId).submitSamplingJob(request, timestamp, providerAuth);
};

export const pollExecutionJobs = async (
  jobs: ExecutionJobRecord[],
  resolveProviderAuth: (targetId: BackendTargetId) => ResolvedProviderAuth,
  nowIso: string = new Date().toISOString(),
): Promise<ExecutionJobRecord[]> =>
  Promise.all(
    jobs.map(async (job) => {
      if (job.queueBehavior !== "provider-queue") return job;
      if (job.status !== "queued" && job.status !== "running") return job;

      try {
        return await getExecutionProviderAdapterForTarget(job.targetId).pollJob(
          job,
          nowIso,
          resolveProviderAuth(job.targetId),
        );
      } catch (error) {
        return markExecutionJobFailed(
          job,
          error instanceof Error ? error.message : `Unable to poll ${job.targetLabel}.`,
          nowIso,
        );
      }
    }),
  );

export const markExecutionJobFailed = (
  job: ExecutionJobRecord,
  errorMessage: string,
  failedAt: string = new Date().toISOString(),
): ExecutionJobRecord => ({
  ...job,
  status: "failed",
  updatedAt: failedAt,
  statusDetail: `Execution failed for ${job.targetLabel}. Retry after correcting the provider or queue issue.`,
  errorMessage,
  polling: {
    ...job.polling,
    resumable: false,
    nextSuggestedPollAt: undefined,
  },
});

export const retryExecutionJob = async (
  job: ExecutionJobRecord,
  resolveProviderAuth: (targetId: BackendTargetId) => ResolvedProviderAuth,
  retriedAt: string = new Date().toISOString(),
): Promise<{ archivedJob: ExecutionJobRecord; retriedJob: ExecutionJobRecord }> => {
  if (!job.request) {
    throw new Error(`Execution job "${job.id}" cannot be retried because its original request snapshot is unavailable.`);
  }

  if (job.supersededByJobId) {
    throw new Error(`Execution job "${job.id}" has already been retried as "${job.supersededByJobId}".`);
  }

  const retriedJob = await getExecutionProviderAdapterForTarget(job.targetId).submitSamplingJob(
    job.request,
    retriedAt,
    resolveProviderAuth(job.targetId),
  );

  return {
    archivedJob: {
      ...job,
      updatedAt: retriedAt,
      statusDetail: `${job.targetLabel} failure retained for history. Retry submitted as ${retriedJob.id}.`,
      supersededByJobId: retriedJob.id,
      polling: {
        ...job.polling,
        resumable: false,
        nextSuggestedPollAt: undefined,
      },
    },
    retriedJob: {
      ...retriedJob,
      sourceJobId: job.id,
      polling: {
        ...retriedJob.polling,
        retryCount: job.polling.retryCount + 1,
      },
    },
  };
};

export const retryExecutionJobInHistory = async (
  jobs: ExecutionJobRecord[],
  jobId: string,
  resolveProviderAuth: (targetId: BackendTargetId) => ResolvedProviderAuth,
  retriedAt: string = new Date().toISOString(),
): Promise<ExecutionJobRecord[]> => {
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job || job.status !== "failed") return jobs;
  try {
    const { archivedJob, retriedJob } = await retryExecutionJob(job, resolveProviderAuth, retriedAt);
    return [retriedJob, ...jobs.map((candidate) => (candidate.id === jobId ? archivedJob : candidate))].slice(
      0,
      MAX_PERSISTED_EXECUTION_JOBS,
    );
  } catch {
    return jobs;
  }
};
