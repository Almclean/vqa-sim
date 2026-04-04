import {
  sampleQaoaMeasurementEstimate,
  sampleVqeMeasurementEstimate,
  type SampledMetricEstimate,
} from "./algorithms";
import {
  getBackendTargetDescriptor,
  isImplementedBackendTarget,
  type BackendProvider,
  type BackendTargetId,
} from "./backendTargets";
import type {
  ExecutionJobRecord,
  ExecutionPollingState,
  SamplingExecutionJobRequest,
  SamplingExecutionJobResult,
} from "./executionJobs";
import {
  IonQApiError,
  createIonQJob,
  decodeIonQResultsToSamplingResult,
  getIonQJobDetails,
  getIonQJobResults,
  type IonQJobStatus,
} from "./ionqApi";
import type { ResolvedProviderAuth } from "./providerAuth";

export interface ExecutionProviderAdapter {
  readonly provider: BackendProvider;
  submitSamplingJob(
    request: SamplingExecutionJobRequest,
    submittedAt: string,
    providerAuth: ResolvedProviderAuth,
  ): Promise<ExecutionJobRecord>;
  pollJob(job: ExecutionJobRecord, nowIso: string, providerAuth: ResolvedProviderAuth): Promise<ExecutionJobRecord>;
}

export type IonQProviderJobStatus = IonQJobStatus;

export type IonQSubmissionResponse = {
  provider: "ionq";
  jobId: string;
  status: "submitted" | "ready" | "running";
  statusDetail?: string;
};

export type IonQJobStatusResponse = {
  provider: "ionq";
  jobId: string;
  status: IonQProviderJobStatus;
  statusDetail?: string;
  result?: SamplingExecutionJobResult;
  errorMessage?: string;
  childJobIds?: string[];
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
  submitSamplingJob(
    request: SamplingExecutionJobRequest,
    submittedAt: string,
    providerAuth: Extract<ResolvedProviderAuth, { provider: "ionq" }>,
  ): Promise<IonQSubmissionResponse>;
  getJobStatus(
    job: ExecutionJobRecord,
    polledAt: string,
    providerAuth: Extract<ResolvedProviderAuth, { provider: "ionq" }>,
  ): Promise<IonQJobStatusResponse>;
  getJobResult(
    job: ExecutionJobRecord,
    retrievedAt: string,
    providerAuth: Extract<ResolvedProviderAuth, { provider: "ionq" }>,
  ): Promise<IonQJobResultResponse>;
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

const runSamplingJobOnBackend = (
  request: SamplingExecutionJobRequest,
  backend: SamplingExecutionJobRequest["targetId"],
): SamplingExecutionJobResult => {
  if (!isImplementedBackendTarget(backend)) {
    throw new Error(`Local execution target "${backend}" is not backed by an implemented local executor.`);
  }

  if (request.algorithm === "qaoa") {
    return toSamplingJobResult(
      sampleQaoaMeasurementEstimate(
        request.nodeCount,
        request.edges,
        request.gammas,
        request.betas,
        request.shots,
        backend,
        request.noiseModel ?? { kind: "ideal" },
      ),
    );
  }

  return toSamplingJobResult(
    sampleVqeMeasurementEstimate(
      request.thetas,
      request.molecule,
      request.shots,
      backend,
      request.noiseModel ?? { kind: "ideal" },
    ),
  );
};

const runLocalSamplingJob = (request: SamplingExecutionJobRequest): SamplingExecutionJobResult =>
  runSamplingJobOnBackend(request, request.targetId);

const makeQueuedPollingState = (
  submittedAt: string,
  externalJobId?: string,
  providerStatus?: string,
): ExecutionPollingState => ({
  attemptCount: 0,
  retryCount: 0,
  resumable: true,
  nextSuggestedPollAt: addMinutesToIsoTimestamp(submittedAt, 15),
  externalJobId,
  providerStatus: providerStatus ?? "submitted",
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

const assertIonQBrowserSessionAuth = (
  providerAuth: Extract<ResolvedProviderAuth, { provider: "ionq" }>,
): Extract<ResolvedProviderAuth, { provider: "ionq"; mode: "browser-session" }> => {
  if (providerAuth.mode !== "browser-session") {
    throw new Error("IonQ browser transport requires browser-session credentials.");
  }

  if (!providerAuth.apiKey) {
    throw new Error("IonQ browser-session mode requires an API key for this tab before remote execution can start.");
  }

  return providerAuth;
};

const describeIonQRemoteStatus = (status: IonQProviderJobStatus, polledAt: string): string => {
  switch (status) {
    case "submitted":
      return "IonQ accepted the remote job and placed it in the provider queue.";
    case "ready":
      return "IonQ has acknowledged the job and it is waiting for execution.";
    case "running":
      return `IonQ reports the job is running as of ${new Date(polledAt).toLocaleString()}.`;
    case "completed":
      return "IonQ reports quantum execution is complete and final results are being prepared.";
    case "failed":
      return "IonQ reported that the remote execution failed.";
    case "canceled":
      return "IonQ reported that the remote execution was canceled.";
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
};

const localProviderAdapter: ExecutionProviderAdapter = {
  provider: "local",
  async submitSamplingJob(request, submittedAt, providerAuth) {
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
  async pollJob(job, _nowIso, providerAuth) {
    assertProviderMatchesAdapter(providerAuth, "local");
    return job;
  },
};

const stubIonQTransport: IonQProviderTransport = {
  provider: "ionq",
  async submitSamplingJob(_request, submittedAt) {
    return {
      provider: "ionq",
      jobId: `ionq_${submittedAt.replace(/[^0-9]/g, "").slice(-12)}`,
      status: "submitted",
      statusDetail: "IonQ accepted the remote job and placed it in the provider queue.",
    };
  },
  async getJobStatus(job, polledAt) {
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
        status: "running",
        statusDetail: `IonQ reports the job is running as of ${new Date(polledAt).toLocaleString()}.`,
      };
    }

    return {
      provider: "ionq",
      jobId: job.polling.externalJobId ?? `ionq_${job.id}`,
      status: "completed",
      statusDetail: "IonQ reports quantum execution is complete and final results are being prepared.",
    };
  },
  async getJobResult(job) {
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
      result: runSamplingJobOnBackend(job.request, "dense-cpu"),
    };
  },
};

const browserSessionIonQTransport: IonQProviderTransport = {
  provider: "ionq",
  async submitSamplingJob(request, submittedAt, providerAuth) {
    const ionqAuth = assertIonQBrowserSessionAuth(providerAuth);
    const response = await createIonQJob(request, ionqAuth.apiKey);

    if (response.status === "completed" || response.status === "failed" || response.status === "canceled") {
      throw new Error(`IonQ returned unexpected submission status "${response.status}".`);
    }

    return {
      provider: "ionq",
      jobId: response.id,
      status: response.status,
      statusDetail: describeIonQRemoteStatus(response.status, submittedAt),
    };
  },
  async getJobStatus(job, polledAt, providerAuth) {
    const ionqAuth = assertIonQBrowserSessionAuth(providerAuth);
    const externalJobId = job.polling.externalJobId;
    if (!externalJobId) {
      throw new Error("IonQ polling requires a provider job identifier.");
    }

    const details = await getIonQJobDetails(externalJobId, ionqAuth.apiKey);
    return {
      provider: "ionq",
      jobId: details.id,
      status: details.status,
      statusDetail: describeIonQRemoteStatus(details.status, polledAt),
      errorMessage: details.failure?.error ?? details.failure?.code,
      childJobIds: details.children,
    };
  },
  async getJobResult(job, _retrievedAt, providerAuth) {
    const ionqAuth = assertIonQBrowserSessionAuth(providerAuth);
    const externalJobId = job.polling.externalJobId;
    if (!externalJobId) {
      throw new Error("IonQ result retrieval requires a provider job identifier.");
    }
    if (!job.request) {
      return {
        provider: "ionq",
        jobId: externalJobId,
        status: "failed",
        errorMessage: "Remote result retrieval requires the original request snapshot.",
      };
    }

    try {
      const results = await getIonQJobResults(externalJobId, ionqAuth.apiKey);
      return {
        provider: "ionq",
        jobId: externalJobId,
        status: "ready",
        statusDetail: "Retrieved final IonQ result payload.",
        result: decodeIonQResultsToSamplingResult(job.request, results, job.polling.providerChildJobIds),
      };
    } catch (error) {
      if (error instanceof IonQApiError && (error.status === 404 || error.status === 409)) {
        return {
          provider: "ionq",
          jobId: externalJobId,
          status: "pending",
          statusDetail: "IonQ finished execution, but the final result payload is not ready yet.",
        };
      }

      return {
        provider: "ionq",
        jobId: externalJobId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "IonQ result retrieval failed.",
      };
    }
  },
};

let ionqTransportOverride: IonQProviderTransport | null = null;

const resolveIonQTransport = (providerAuth: Extract<ResolvedProviderAuth, { provider: "ionq" }>): IonQProviderTransport => {
  if (ionqTransportOverride) {
    return ionqTransportOverride;
  }

  return providerAuth.mode === "browser-session" ? browserSessionIonQTransport : stubIonQTransport;
};

const mapIonQJobStatusToExecutionRecord = async (
  job: ExecutionJobRecord,
  response: IonQJobStatusResponse,
  polledAt: string,
  providerAuth: Extract<ResolvedProviderAuth, { provider: "ionq" }>,
  transport: IonQProviderTransport,
): Promise<ExecutionJobRecord> => {
  const basePollingState: ExecutionPollingState = {
    ...job.polling,
    attemptCount: job.polling.attemptCount + 1,
    lastAttemptedAt: polledAt,
    nextSuggestedPollAt: undefined,
    externalJobId: response.jobId,
    providerStatus: response.status,
    providerChildJobIds: response.childJobIds ?? job.polling.providerChildJobIds,
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
    case "running":
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
        const completedJob: ExecutionJobRecord = {
          ...job,
          polling: basePollingState,
        };
        const retrieval = await transport.getJobResult(completedJob, polledAt, providerAuth);
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
  async submitSamplingJob(request, submittedAt, providerAuth) {
    const resolvedAuth = assertIonQProviderAuth(providerAuth);
    const descriptor = getBackendTargetDescriptor(request.targetId);
    const transport = resolveIonQTransport(resolvedAuth);
    const submission = await transport.submitSamplingJob(request, submittedAt, resolvedAuth);
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
      status: submission.status === "running" ? "running" : "queued",
      submittedAt,
      updatedAt: submittedAt,
      startedAt: submission.status === "running" ? submittedAt : undefined,
      shots: request.shots,
      queueBehavior: "provider-queue",
      statusDetail,
      polling: makeQueuedPollingState(submittedAt, submission.jobId, submission.status),
      request,
    };
  },
  async pollJob(job, nowIso, providerAuth) {
    const resolvedAuth = assertIonQProviderAuth(providerAuth);
    if (job.status !== "queued" && job.status !== "running") {
      return job;
    }

    const transport = resolveIonQTransport(resolvedAuth);
    const response = await transport.getJobStatus(job, nowIso, resolvedAuth);
    return mapIonQJobStatusToExecutionRecord(job, response, nowIso, resolvedAuth, transport);
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
  ionqTransportOverride = transport;
};

export const resetIonQProviderTransport = (): void => {
  ionqTransportOverride = null;
};
