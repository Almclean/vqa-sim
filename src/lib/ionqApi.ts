import {
  estimateQaoaCostFromBitstrings,
  estimateVqeEnergyFromMeasurementBitstrings,
} from "./algorithms";
import type { SamplingExecutionJobRequest, SamplingExecutionJobResult } from "./executionJobs";

type IonQRotationGate = {
  gate: "rx" | "ry" | "rz";
  target: number;
  rotation: number;
};

type IonQStaticGate = {
  gate: "h";
  target: number;
};

type IonQControlledGate = {
  gate: "cnot";
  control: number;
  target: number;
};

export type IonQQisOperation = IonQRotationGate | IonQStaticGate | IonQControlledGate;

type IonQSingleCircuitInput = {
  format: "ionq.circuit.v0";
  gateset: "qis";
  qubits: number;
  circuit: IonQQisOperation[];
};

type IonQMultiCircuitInput = {
  format: "ionq.circuit.v0";
  gateset: "qis";
  qubits: number;
  circuits: Array<{
    name: string;
    circuit: IonQQisOperation[];
  }>;
};

export type IonQCreateJobBody = {
  name: string;
  shots: number;
  target: string;
  metadata: Record<string, string>;
  input: IonQSingleCircuitInput | IonQMultiCircuitInput;
};

export type IonQJobStatus = "submitted" | "ready" | "running" | "completed" | "failed" | "canceled";

export type IonQJobDetailsResponse = {
  id: string;
  status: IonQJobStatus;
  request?: number;
  target?: string;
  shots?: number;
  results_url?: string;
  children?: string[];
  failure?: {
    error?: string;
    code?: string;
  } | null;
  warning?: {
    messages?: string[];
  } | null;
};

export type IonQProbabilityMap = Record<string, number>;

export type IonQResultsResponse = IonQProbabilityMap | Record<string, IonQProbabilityMap>;

export class IonQApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "IonQApiError";
    this.status = status;
  }
}

const IONQ_V03_BASE_URL = "https://api.ionq.co/v0.3";

const transpileExecutableCircuitToIonQQis = (request: SamplingExecutionJobRequest): IonQQisOperation[] => {
  const operations: IonQQisOperation[] = [];

  for (const operation of request.circuit.operations) {
    switch (operation.kind) {
      case "rx":
        operations.push({
          gate: "rx",
          target: operation.qubit,
          rotation: operation.theta,
        });
        break;
      case "ry":
        operations.push({
          gate: "ry",
          target: operation.qubit,
          rotation: operation.theta,
        });
        break;
      case "xx":
        operations.push(
          { gate: "h", target: operation.q1 },
          { gate: "h", target: operation.q2 },
          { gate: "cnot", control: operation.q1, target: operation.q2 },
          { gate: "rz", target: operation.q2, rotation: operation.theta },
          { gate: "cnot", control: operation.q1, target: operation.q2 },
          { gate: "h", target: operation.q1 },
          { gate: "h", target: operation.q2 },
        );
        break;
      default: {
        const exhaustiveCheck: never = operation;
        throw new Error(`Unsupported circuit operation ${(exhaustiveCheck as { kind?: string }).kind ?? "unknown"}.`);
      }
    }
  }

  return operations;
};

const buildVqeXxMeasurementCircuit = (
  request: Extract<SamplingExecutionJobRequest, { algorithm: "vqe" }>,
): IonQQisOperation[] => [
  ...transpileExecutableCircuitToIonQQis(request),
  { gate: "ry", target: 0, rotation: -Math.PI / 2 },
  { gate: "ry", target: 1, rotation: -Math.PI / 2 },
];

export const buildIonQCreateJobBody = (request: SamplingExecutionJobRequest, target: string): IonQCreateJobBody => {
  const baseMetadata = {
    algorithm: request.algorithm,
    executionTarget: request.targetId,
    shotCount: String(request.shots),
  };

  if (request.algorithm === "qaoa") {
    return {
      name: `vqa-sim qaoa ${request.targetId}`,
      shots: request.shots,
      target,
      metadata: baseMetadata,
      input: {
        format: "ionq.circuit.v0",
        gateset: "qis",
        qubits: request.circuit.qubitCount,
        circuit: transpileExecutableCircuitToIonQQis(request),
      },
    };
  }

  return {
    name: `vqa-sim vqe ${request.targetId}`,
    shots: request.shots,
    target,
    metadata: {
      ...baseMetadata,
      measurementBases: "z-basis,xx-basis",
    },
    input: {
      format: "ionq.circuit.v0",
      gateset: "qis",
      qubits: request.circuit.qubitCount,
      circuits: [
        {
          name: "z-basis",
          circuit: transpileExecutableCircuitToIonQQis(request),
        },
        {
          name: "xx-basis",
          circuit: buildVqeXxMeasurementCircuit(request),
        },
      ],
    },
  };
};

const probabilityMapToBitstrings = (
  probabilities: Record<string, number>,
  qubitCount: number,
  shots: number,
): string[] => {
  const entries = Object.entries(probabilities)
    .map(([state, probability]) => ({
      bitstring: Number.parseInt(state, 10).toString(2).padStart(qubitCount, "0"),
      exactCount: probability * shots,
    }))
    .sort((a, b) => b.exactCount - a.exactCount || a.bitstring.localeCompare(b.bitstring));

  if (entries.length === 0) {
    return [];
  }

  const floorCounts = entries.map((entry) => Math.floor(entry.exactCount));
  let remaining = Math.max(0, shots - floorCounts.reduce((sum, count) => sum + count, 0));
  const remainders = entries
    .map((entry, index) => ({
      index,
      remainder: entry.exactCount - floorCounts[index]!,
    }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const { index } of remainders) {
    if (remaining <= 0) break;
    floorCounts[index] = (floorCounts[index] ?? 0) + 1;
    remaining -= 1;
  }

  return entries.flatMap((entry, index) => Array.from({ length: floorCounts[index] ?? 0 }, () => entry.bitstring));
};

export const decodeIonQResultsToSamplingResult = (
  request: SamplingExecutionJobRequest,
  results: IonQResultsResponse,
  childJobIds?: string[],
): SamplingExecutionJobResult => {
  const isProbabilityMap = (value: IonQResultsResponse): value is IonQProbabilityMap =>
    Object.values(value).every((entry) => typeof entry === "number");

  const orderedResultEntries =
    childJobIds && childJobIds.length > 0
      ? childJobIds.map((jobId) => (!isProbabilityMap(results) ? results[jobId] ?? {} : {}))
      : isProbabilityMap(results)
        ? [results]
        : Object.values(results);

  if (request.algorithm === "qaoa") {
    const primaryResult = orderedResultEntries[0];
    if (!primaryResult) {
      throw new Error("IonQ results payload did not include the expected QAOA circuit result.");
    }

    const bitstrings = probabilityMapToBitstrings(primaryResult, request.circuit.qubitCount, request.shots);
    return {
      estimate: estimateQaoaCostFromBitstrings(request.nodeCount, request.edges, bitstrings),
      totalShotsUsed: bitstrings.length,
      bitstrings,
    };
  }

  const zBasisResult = orderedResultEntries[0];
  const xxBasisResult = orderedResultEntries[1];
  if (!zBasisResult || !xxBasisResult) {
    throw new Error("IonQ multicircuit results did not include both VQE measurement bases.");
  }

  const zBasisBitstrings = probabilityMapToBitstrings(zBasisResult, request.circuit.qubitCount, request.shots);
  const xxBasisBitstrings = probabilityMapToBitstrings(xxBasisResult, request.circuit.qubitCount, request.shots);

  return {
    estimate: estimateVqeEnergyFromMeasurementBitstrings(request.molecule, zBasisBitstrings, xxBasisBitstrings),
    totalShotsUsed: zBasisBitstrings.length + xxBasisBitstrings.length,
    bitstrings: zBasisBitstrings,
  };
};

export const getIonQTarget = (targetId: SamplingExecutionJobRequest["targetId"]): string => {
  if (targetId === "ionq-simulator") {
    return import.meta.env.VITE_IONQ_SIMULATOR_TARGET || "simulator";
  }

  return import.meta.env.VITE_IONQ_QPU_TARGET || "qpu.aria-1";
};

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as {
      error?: string;
      message?: string;
      detail?: string;
    };
    return payload.error ?? payload.message ?? payload.detail ?? `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

export const ionqFetchJson = async <T>(path: string, apiKey: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${IONQ_V03_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `apiKey ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new IonQApiError(response.status, `IonQ API request failed: ${await readErrorMessage(response)}`);
  }

  return (await response.json()) as T;
};

export const createIonQJob = async (request: SamplingExecutionJobRequest, apiKey: string): Promise<IonQJobDetailsResponse> =>
  ionqFetchJson<IonQJobDetailsResponse>("/jobs", apiKey, {
    method: "POST",
    body: JSON.stringify(buildIonQCreateJobBody(request, getIonQTarget(request.targetId))),
  });

export const getIonQJobDetails = async (jobId: string, apiKey: string): Promise<IonQJobDetailsResponse> =>
  ionqFetchJson<IonQJobDetailsResponse>(`/jobs/${jobId}`, apiKey);

export const getIonQJobResults = async (jobId: string, apiKey: string): Promise<IonQResultsResponse> =>
  ionqFetchJson<IonQResultsResponse>(`/jobs/${jobId}/results`, apiKey);
