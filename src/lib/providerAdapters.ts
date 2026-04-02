import {
  sampleQaoaMeasurementEstimate,
  sampleVqeMeasurementEstimate,
  type SampledMetricEstimate,
} from "./algorithms";
import {
  getBackendTargetDescriptor,
  type BackendProvider,
  type BackendTargetId,
} from "./backendTargets";
import type {
  ExecutionJobRecord,
  ExecutionPollingState,
  SamplingExecutionJobRequest,
  SamplingExecutionJobResult,
} from "./executionJobs";

export interface ExecutionProviderAdapter {
  readonly provider: BackendProvider;
  submitSamplingJob(request: SamplingExecutionJobRequest, submittedAt: string): ExecutionJobRecord;
  pollJob(job: ExecutionJobRecord, nowIso: string): ExecutionJobRecord;
}

const addMinutesToIsoTimestamp = (timestamp: string, minutes: number): string => {
  const parsed = new Date(timestamp);
  parsed.setMinutes(parsed.getMinutes() + minutes);
  return parsed.toISOString();
};

const toSamplingJobResult = (estimate: SampledMetricEstimate): SamplingExecutionJobResult => ({
  estimate: estimate.estimatedValue,
  totalShotsUsed: estimate.totalShotsUsed,
  bitstrings: estimate.bitstrings,
});

const runLocalSamplingJob = (request: SamplingExecutionJobRequest): SamplingExecutionJobResult => {
  if (request.algorithm === "qaoa") {
    return toSamplingJobResult(
      sampleQaoaMeasurementEstimate(
        request.nodeCount,
        request.edges,
        request.gammas,
        request.betas,
        request.shots,
        "dense-cpu",
      ),
    );
  }

  return toSamplingJobResult(sampleVqeMeasurementEstimate(request.thetas, request.molecule, request.shots, "dense-cpu"));
};

const makeQueuedPollingState = (submittedAt: string): ExecutionPollingState => ({
  attemptCount: 0,
  retryCount: 0,
  resumable: true,
  nextSuggestedPollAt: addMinutesToIsoTimestamp(submittedAt, 15),
});

const localProviderAdapter: ExecutionProviderAdapter = {
  provider: "local",
  submitSamplingJob(request, submittedAt) {
    const descriptor = getBackendTargetDescriptor(request.targetId);
    const result = runLocalSamplingJob(request);

    return {
      id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      targetId: request.targetId,
      targetLabel: descriptor.label,
      algorithm: request.algorithm,
      intent: "shot-sampling",
      status: "completed",
      submittedAt,
      updatedAt: submittedAt,
      startedAt: submittedAt,
      completedAt: submittedAt,
      shots: request.shots,
      queueBehavior: "instant",
      statusDetail: `Completed immediately on ${descriptor.label}.`,
      polling: {
        attemptCount: 0,
        retryCount: 0,
        resumable: false,
      },
      result,
    };
  },
  pollJob(job) {
    return job;
  },
};

const ionqProviderAdapter: ExecutionProviderAdapter = {
  provider: "ionq",
  submitSamplingJob(request, submittedAt) {
    const descriptor = getBackendTargetDescriptor(request.targetId);

    return {
      id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      targetId: request.targetId,
      targetLabel: descriptor.label,
      algorithm: request.algorithm,
      intent: "shot-sampling",
      status: "queued",
      submittedAt,
      updatedAt: submittedAt,
      shots: request.shots,
      queueBehavior: "provider-queue",
      statusDetail: `${descriptor.label} is modeled as a queued remote target. Polling and result retrieval are not implemented yet.`,
      polling: makeQueuedPollingState(submittedAt),
    };
  },
  pollJob(job, nowIso) {
    if (job.status !== "queued" && job.status !== "running") {
      return job;
    }

    const nextAttemptCount = job.polling.attemptCount + 1;
    const nextPollingState: ExecutionPollingState = {
      ...job.polling,
      attemptCount: nextAttemptCount,
      lastAttemptedAt: nowIso,
      nextSuggestedPollAt: addMinutesToIsoTimestamp(nowIso, job.status === "queued" ? 30 : 120),
      externalJobId: job.polling.externalJobId ?? `remote_${job.id}`,
    };

    if (job.status === "queued") {
      return {
        ...job,
        status: "running",
        updatedAt: nowIso,
        startedAt: job.startedAt ?? nowIso,
        statusDetail: `${job.targetLabel} acknowledged the job. Continue polling later for completion.`,
        polling: nextPollingState,
      };
    }

    return {
      ...job,
      updatedAt: nowIso,
      statusDetail: `${job.targetLabel} is still running remotely. Last checked at ${new Date(nowIso).toLocaleString()}.`,
      polling: nextPollingState,
    };
  },
};

const PROVIDER_ADAPTERS: Record<BackendProvider, ExecutionProviderAdapter> = {
  local: localProviderAdapter,
  ionq: ionqProviderAdapter,
};

export const getExecutionProviderAdapter = (provider: BackendProvider): ExecutionProviderAdapter =>
  PROVIDER_ADAPTERS[provider];

export const getExecutionProviderAdapterForTarget = (targetId: BackendTargetId): ExecutionProviderAdapter =>
  getExecutionProviderAdapter(getBackendTargetDescriptor(targetId).provider);
