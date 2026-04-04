import type { ExecutionJobRecord } from "../lib/executionJobs";

type ExecutionJobsPanelProps = {
  jobs: ExecutionJobRecord[];
  busy: boolean;
  retryingJobId: string | null;
  onClearHistory: () => void;
  onPollJobs: () => void | Promise<void>;
  onRetryJob: (jobId: string) => void | Promise<void>;
};

const formatTimestamp = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const getStatusClassName = (status: ExecutionJobRecord["status"]): string => {
  switch (status) {
    case "completed":
      return "border-emerald-700 text-emerald-300";
    case "queued":
      return "border-amber-700 text-amber-300";
    case "running":
      return "border-cyan-700 text-cyan-300";
    case "failed":
      return "border-red-700 text-red-300";
    default:
      return "border-neutral-700 text-neutral-300";
  }
};

export function ExecutionJobsPanel({
  jobs,
  busy,
  retryingJobId,
  onClearHistory,
  onPollJobs,
  onRetryJob,
}: ExecutionJobsPanelProps): JSX.Element {
  const hasPollableJobs = jobs.some((job) => job.polling.resumable && (job.status === "queued" || job.status === "running"));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-300">Execution Jobs</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPollJobs}
            disabled={!hasPollableJobs || busy}
            className="rounded-md border border-cyan-800 bg-cyan-950/30 px-2 py-1 text-xs text-cyan-200 transition hover:bg-cyan-950/50 disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500"
          >
            {busy ? "Polling..." : "Poll Jobs"}
          </button>
          <button
            type="button"
            onClick={onClearHistory}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 transition hover:bg-neutral-800"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
        {jobs.length === 0 ? (
          <p className="text-xs text-neutral-500">
            No execution jobs yet. Local simulator work and future remote provider work will both appear here.
          </p>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li key={job.id} className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-neutral-100">
                      {job.targetLabel} · {job.intent}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {job.algorithm.toUpperCase()} · {job.shots} shots · {formatTimestamp(job.submittedAt)}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.18em] ${getStatusClassName(job.status)}`}>
                    {job.status}
                  </span>
                </div>

                <p className="mt-2 text-xs text-neutral-400">{job.statusDetail}</p>

                <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                  <span>Attempts: {job.polling.attemptCount}</span>
                  <span>Retries: {job.polling.retryCount}</span>
                  {job.sourceJobId ? <span>Retry of: {job.sourceJobId}</span> : null}
                  {job.supersededByJobId ? <span>Retried as: {job.supersededByJobId}</span> : null}
                  {job.polling.externalJobId ? <span>Provider job: {job.polling.externalJobId}</span> : null}
                  {job.polling.providerStatus ? <span>Provider status: {job.polling.providerStatus}</span> : null}
                  {job.polling.resultRetrievalState ? <span>Result retrieval: {job.polling.resultRetrievalState}</span> : null}
                  {job.polling.lastAttemptedAt ? <span>Last poll: {formatTimestamp(job.polling.lastAttemptedAt)}</span> : null}
                  {job.polling.lastResultRetrievedAt ? <span>Last result fetch: {formatTimestamp(job.polling.lastResultRetrievedAt)}</span> : null}
                  {job.polling.nextSuggestedPollAt ? <span>Next poll: {formatTimestamp(job.polling.nextSuggestedPollAt)}</span> : null}
                </div>

                {job.result ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-neutral-800 bg-neutral-950/70 p-2">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Estimate</p>
                      <p className="mt-1 font-mono text-sm text-cyan-300">{job.result.estimate.toFixed(6)}</p>
                    </div>
                    <div className="rounded-md border border-neutral-800 bg-neutral-950/70 p-2">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Total shots used</p>
                      <p className="mt-1 font-mono text-sm text-neutral-100">{job.result.totalShotsUsed}</p>
                    </div>
                  </div>
                ) : null}

                {job.errorMessage ? <p className="mt-2 text-xs text-red-300">{job.errorMessage}</p> : null}
                {job.status === "failed" ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => onRetryJob(job.id)}
                      disabled={busy || Boolean(job.supersededByJobId) || !job.request}
                      className="rounded-md border border-amber-700 bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-200 transition hover:bg-amber-950/50"
                    >
                      {job.supersededByJobId
                        ? "Retry Submitted"
                        : retryingJobId === job.id
                          ? "Retrying..."
                          : job.request
                            ? "Retry Job"
                            : "Retry Unavailable"}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
