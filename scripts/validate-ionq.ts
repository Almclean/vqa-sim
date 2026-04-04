import { buildQaoaExecutionCircuit } from "../src/lib/algorithms";
import { createIonQJob, decodeIonQResultsToSamplingResult, getIonQJobDetails, getIonQJobResults } from "../src/lib/ionqApi";

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const apiKey = process.env.IONQ_API_KEY?.trim();
if (!apiKey) {
  throw new Error("Set IONQ_API_KEY before running the IonQ live validator.");
}

const maxPollAttempts = Number.parseInt(process.env.IONQ_MAX_POLL_ATTEMPTS ?? "20", 10);
const pollIntervalMs = Number.parseInt(process.env.IONQ_POLL_INTERVAL_MS ?? "5000", 10);

const request = {
  targetId: "ionq-simulator" as const,
  circuit: buildQaoaExecutionCircuit(2, [[0, 1]], [0.4], [0.2]),
  algorithm: "qaoa" as const,
  shots: 16,
  nodeCount: 2,
  edges: ["0-1"],
  gammas: [0.4],
  betas: [0.2],
};

const submission = await createIonQJob(request, apiKey);
console.log("submitted", {
  id: submission.id,
  status: submission.status,
  target: submission.target,
  shots: submission.shots,
});

let attempts = 0;
let lastStatus = submission.status;

while (attempts < maxPollAttempts) {
  attempts += 1;
  const details = await getIonQJobDetails(submission.id, apiKey);
  lastStatus = details.status;
  console.log("status", {
    attempt: attempts,
    status: details.status,
    children: details.children ?? [],
    failure: details.failure ?? null,
  });

  if (details.status === "completed") {
    const rawResults = await getIonQJobResults(details.id, apiKey);
    const decoded = decodeIonQResultsToSamplingResult(request, rawResults, details.children);
    console.log("results", rawResults);
    console.log("decoded", decoded);
    process.exit(0);
  }

  if (details.status === "failed" || details.status === "canceled") {
    throw new Error(`IonQ job ${details.id} ended with status ${details.status}.`);
  }

  await sleep(pollIntervalMs);
}

throw new Error(`IonQ job ${submission.id} did not complete after ${maxPollAttempts} polls; last status was ${lastStatus}.`);
