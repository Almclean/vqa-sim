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
import type { ResolvedProviderAuth } from "./providerAuth";

export interface ExecutionProviderAdapter {
  readonly provider: BackendProvider;
  submitSamplingJob(
    request: SamplingExecutionJobRequest,
    submittedAt: string,
    providerAuth: ResolvedProviderAuth,
  ): ExecutionJobRecord;
  pollJob(job: ExecutionJobRecord, nowIso: string, providerAuth: ResolvedProviderAuth): ExecutionJobRecord;
}

export type IonQProviderJobStatus = "submitted" | "ready" | "started" | "completed" | "failed" | "canceled";

export type IonQSubmissionResponse = {
  provider: "ionq";
  jobId: string;
  status: Exclude<IonQProviderJobStatus, "completed" | "failed" | "canceled">;
  statusDetail?: string;
};

export type IonQJobStatusResponse = {
  provider: "ionq";
  jobId: string;
  status: IonQProviderJobStatus;
  statusDetail?: string;
  result?: SamplingExecutionJobResult;
  errorMessage?: string;
};

export type IonQJobResultResponse = {
  provider: "ionq";
  jobId: string;
  status: "pending" | "ready" | "failed";
  statusDetail?: string;
  result?: SamplingExecutionJobResult;
  errorMessage?: string;
};

export interface IonQProviderTransport {
  readonly provider: "ionq";
  submitSamplingJob(request: SamplingExecutionJobRequest, submittedAt: string): IonQSubmissionResponse;
  getJobStatus(job: ExecutionJobRecord, polledAt: string): IonQJobStatusResponse;
  getJobResult(job: ExecutionJobRecord, retrievedAt: string): IonQJobResultResponse;
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

const makeQueuedPollingState = (submittedAt: string, externalJobId?: string): ExecutionPollingState => ({
  attemptCount: 0,
  retryCount: 0,
  resumable: true,
  nextSuggestedPollAt: addMinutesToIsoTimestamp(submittedAt, 15),
  externalJobId,
  providerStatus: "submitted",
});

const makeExecutionJobId = (): string =>
  `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const assertProviderMatchesAdapter = (
  providerAuth: ResolvedProviderAuth,
  expectedProvider: BackendProvider,
): ResolvedProviderAuth => {
  if (providerAuth.provider !== expectedProvider) {
    throw new Error(`Execution auth for provider "${providerAuth.provider}" cannot be used with "${expectedProvider}".`);
  }
  return providerAuth;
};

const assertIonQProviderAuth = (
  providerAuth: ResolvedProviderAuth,
): Extract<ResolvedProviderAuth, { provider: "ionq" }> => {
  const ionqAuth = assertProviderMatchesAdapter(providerAuth, "ionq") as Extract<ResolvedProviderAuth, { provider: "ionq" }>;

  if (ionqAuth.mode === "browser-session" && !ionqAuth.apiKey) {
    throw new Error("IonQ browser-session mode requires an API key for this tab before remote execution can start.");
  }

  return ionqAuth;
};

const localProviderAdapter: ExecutionProviderAdapter = {
  provider: "local",
  submitSamplingJob(request, submittedAt, providerAuth) {
    assertProviderMatchesAdapter(providerAuth, "local");
    const descriptor = getBackendTargetDescriptor(request.targetId);
    const result = runLocalSamplingJob(request);

    return {
      id: makeExecutionJobId(),
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
      request,
      result,
    };
  },
  pollJob(job, _nowIso, providerAuth) {
    assertProviderMatchesAdapter(providerAuth, "local");
    return job;
  },
};

const defaultIonQTransport: IonQProviderTransport = {
  provider: "ionq",
  submitSamplingJob(_request, submittedAt) {
    return {
      provider: "ionq",
      jobId: `ionq_${submittedAt.replace(/[^0-9]/g, "").slice(-12)}`,
      status: "submitted",
      statusDetail: "IonQ accepted the remote job and placed it in the provider queue.",
    };
  },
  getJobStatus(job, polledAt) {
    if (job.polling.providerStatus === "completed") {
      return {
        provider: "ionq",
        jobId: job.polling.externalJobId ?? `ionq_${job.id}`,
        status: "completed",
        statusDetail: "IonQ execution is complete. Final result payload retrieval is still pending.",
      };
    }

    if (job.polling.attemptCount === 0) {
      return {
        provider: "ionq",
        jobId: job.polling.externalJobId ?? `ionq_${job.id}`,
        status: "ready",
        statusDetail: "IonQ has acknowledged the job and it is waiting for execution.",
      };
    }

    if (job.polling.attemptCount === 1) {
      return {
        provider: "ionq",
        jobId: job.polling.externalJobId ?? `ionq_${job.id}`,
        status: "started",
        statusDetail: `IonQ reports the job started execution as of ${new Date(polledAt).toLocaleString()}.`,
      };
    }

    return {
      provider: "ionq",
      jobId: job.polling.externalJobId ?? `ionq_${job.id}`,
      status: "completed",
      statusDetail: "IonQ reports quantum execution is complete and final results are being prepared.",
    };
  },
  getJobResult(job) {
    if (!job.request) {
      return {
        provider: "ionq",
        jobId: job.polling.externalJobId ?? `ionq_${job.id}`,
        status: "failed",
        errorMessage: "Remote result retrieval requires the original request snapshot.",
      };
    }

    if ((job.polling.resultRetrievalAttemptCount ?? 0) === 0) {
      return {
        provider: "ionq",
        jobId: job.polling.externalJobId ?? `ionq_${job.id}`,
        status: "pending",
        statusDetail: "IonQ finished execution, but the final result payload is not ready yet.",
      };
    }

    return {
      provider: "ionq",
      jobId: job.polling.externalJobId ?? `ionq_${job.id}`,
      status: "ready",
      statusDetail: "Retrieved final IonQ result payload.",
      result: runLocalSamplingJob(job.request),
    };
  },
};

let ionqTransport: IonQProviderTransport = defaultIonQTransport;

const mapIonQJobStatusToExecutionRecord = (
  job: ExecutionJobRecord,
  response: IonQJobStatusResponse,
  polledAt: string,
): ExecutionJobRecord => {
  const basePollingState: ExecutionPollingState = {
    ...job.polling,
    attemptCount: job.polling.attemptCount + 1,
    lastAttemptedAt: polledAt,
    nextSuggestedPollAt: undefined,
    externalJobId: response.jobId,
    providerStatus: response.status,
    resultRetrievalState: job.polling.resultRetrievalState,
    resultRetrievalAttemptCount: job.polling.resultRetrievalAttemptCount,
    lastResultRetrievedAt: job.polling.lastResultRetrievedAt,
  };

  switch (response.status) {
    case "submitted":
    case "ready":
      return {
        ...job,
        status: "queued",
        updatedAt: polledAt,
        statusDetail: response.statusDetail ?? `${job.targetLabel} is queued at the provider.`,
        polling: {
          ...basePollingState,
          resumable: true,
          nextSuggestedPollAt: addMinutesToIsoTimestamp(polledAt, 30),
        },
      };
    case "started":
      return {
        ...job,
        status: "running",
        updatedAt: polledAt,
        startedAt: job.startedAt ?? polledAt,
        statusDetail: response.statusDetail ?? `${job.targetLabel} is running remotely.`,
        polling: {
          ...basePollingState,
          resumable: true,
          nextSuggestedPollAt: addMinutesToIsoTimestamp(polledAt, 120),
        },
      };
    case "completed":
      if (!response.result) {
        const retrieval = ionqTransport.getJobResult(job, polledAt);
        const retrievalAttemptCount = (job.polling.resultRetrievalAttemptCount ?? 0) + 1;

        if (retrieval.status === "pending") {
          return {
            ...job,
            status: "running",
            updatedAt: polledAt,
            startedAt: job.startedAt ?? polledAt,
            statusDetail:
              retrieval.statusDetail ?? `${job.targetLabel} finished execution remotely and is waiting for final results.`,
            polling: {
              ...basePollingState,
              resumable: true,
              nextSuggestedPollAt: addMinutesToIsoTimestamp(polledAt, 60),
              resultRetrievalState: "pending",
              resultRetrievalAttemptCount: retrievalAttemptCount,
              lastResultRetrievedAt: polledAt,
            },
          };
        }

        if (retrieval.status === "failed") {
          return {
            ...job,
            status: "failed",
            updatedAt: polledAt,
            statusDetail:
              retrieval.statusDetail ?? `${job.targetLabel} completed remotely but final result retrieval failed.`,
            polling: {
              ...basePollingState,
              resumable: false,
              resultRetrievalState: "pending",
              resultRetrievalAttemptCount: retrievalAttemptCount,
              lastResultRetrievedAt: polledAt,
            },
            errorMessage: retrieval.errorMessage ?? `${job.targetLabel} could not retrieve final provider results.`,
          };
        }

        return {
          ...job,
          status: "completed",
          updatedAt: polledAt,
          startedAt: job.startedAt ?? polledAt,
          completedAt: polledAt,
          statusDetail: retrieval.statusDetail ?? `${job.targetLabel} completed remotely.`,
          polling: {
            ...basePollingState,
            resumable: false,
            resultRetrievalState: "retrieved",
            resultRetrievalAttemptCount: retrievalAttemptCount,
            lastResultRetrievedAt: polledAt,
          },
          result: retrieval.result ?? job.result,
          errorMessage: undefined,
        };
      }

      return {
        ...job,
        status: "completed",
        updatedAt: polledAt,
        startedAt: job.startedAt ?? polledAt,
        completedAt: polledAt,
        statusDetail: response.statusDetail ?? `${job.targetLabel} completed remotely.`,
        polling: {
          ...basePollingState,
          resumable: false,
          resultRetrievalState: "retrieved",
          lastResultRetrievedAt: polledAt,
        },
        result: response.result ?? job.result,
        errorMessage: undefined,
      };
    case "failed":
    case "canceled":
      return {
        ...job,
        status: "failed",
        updatedAt: polledAt,
        statusDetail: response.statusDetail ?? `${job.targetLabel} failed remotely.`,
        polling: {
          ...basePollingState,
          resumable: false,
        },
        errorMessage: response.errorMessage ?? `${job.targetLabel} returned provider status "${response.status}".`,
      };
    default: {
      const exhaustiveCheck: never = response.status;
      return exhaustiveCheck;
    }
  }
};

const ionqProviderAdapter: ExecutionProviderAdapter = {
  provider: "ionq",
  submitSamplingJob(request, submittedAt, providerAuth) {
    const resolvedAuth = assertIonQProviderAuth(providerAuth);
    const descriptor = getBackendTargetDescriptor(request.targetId);
    const submission = ionqTransport.submitSamplingJob(request, submittedAt);
    const authSuffix =
      resolvedAuth.mode === "server-managed"
        ? "Provider auth will be supplied by the server-side execution layer."
        : "Provider auth is available from this browser session.";
    const statusDetail = submission.statusDetail
      ? `${submission.statusDetail} ${authSuffix}`
      : `${descriptor.label} is queued at the provider. ${authSuffix}`;

    return {
      id: makeExecutionJobId(),
      targetId: request.targetId,
      targetLabel: descriptor.label,
      algorithm: request.algorithm,
      intent: "shot-sampling",
      status: "queued",
      submittedAt,
      updatedAt: submittedAt,
      shots: request.shots,
      queueBehavior: "provider-queue",
      statusDetail,
      polling: makeQueuedPollingState(submittedAt, submission.jobId),
      request,
    };
  },
  pollJob(job, nowIso, providerAuth) {
    assertIonQProviderAuth(providerAuth);
    if (job.status !== "queued" && job.status !== "running") {
      return job;
    }

    const response = ionqTransport.getJobStatus(job, nowIso);
    return mapIonQJobStatusToExecutionRecord(job, response, nowIso);
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

export const setIonQProviderTransport = (transport: IonQProviderTransport): void => {
  ionqTransport = transport;
};

export const resetIonQProviderTransport = (): void => {
  ionqTransport = defaultIonQTransport;
};
