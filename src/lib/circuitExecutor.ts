import { DensityMatrixSimulator, probabilitiesToBitstrings } from "./densityMatrixSimulator";
import { QuantumSimulator, type ComplexAmplitude } from "./quantumSimulator";

export type BackendKind = "dense-cpu" | "density-cpu";

export type ExecutorCapability = "ideal-execution" | "expectation-values" | "shot-sampling" | "state-vector";

export type CircuitOperation =
  | { kind: "rx"; qubit: number; theta: number }
  | { kind: "ry"; qubit: number; theta: number }
  | { kind: "xx"; q1: number; q2: number; theta: number };

export type ExecutableCircuit = {
  qubitCount: number;
  operations: CircuitOperation[];
};

export type Observable =
  | { kind: "z"; qubit: number }
  | { kind: "zz"; q1: number; q2: number }
  | { kind: "xx"; q1: number; q2: number };

export type MeasurementRequest = {
  kind: "all-qubits";
  shots: number;
};

export type StateVectorRequest = {
  kind: "final-state-vector";
};

export type NoiseModel =
  | { kind: "ideal" }
  | {
      kind: "depolarizing";
      probability: number;
    }
  | {
      kind: "composite";
      depolarizingProbability: number;
      amplitudeDampingProbability: number;
      readoutErrorProbability: number;
    };

export type ExecutionRequest = {
  backend?: BackendKind;
  circuit: ExecutableCircuit;
  observables?: Observable[];
  measurement?: MeasurementRequest;
  stateVector?: StateVectorRequest;
  noiseModel?: NoiseModel;
};

export type MeasurementResult = {
  kind: "all-qubits";
  shots: number;
  bitstrings: string[];
};

export type ExpectationValuesResult = {
  kind: "expectation-values";
  observables: Observable[];
  values: number[];
};

export type StateVectorResult = {
  kind: "final-state-vector";
  amplitudes: ComplexAmplitude[];
};

export type ExecutionResult = {
  backend: BackendKind;
  expectationValues?: ExpectationValuesResult;
  measurement?: MeasurementResult;
  stateVector?: StateVectorResult;
};

export interface CircuitExecutor {
  readonly backend: BackendKind;
  readonly capabilities: readonly ExecutorCapability[];
  execute(request: ExecutionRequest): ExecutionResult;
}

export const supportsCapability = (
  executor: Pick<CircuitExecutor, "capabilities">,
  capability: ExecutorCapability,
): boolean => executor.capabilities.includes(capability);

const assertValidShotCount = (shots: number): void => {
  if (!Number.isInteger(shots) || shots < 1) {
    throw new Error(`Invalid shot count ${shots}; expected a positive integer.`);
  }
};

const assertValidQubitIndex = (qubit: number, qubitCount: number, label: string): void => {
  if (!Number.isInteger(qubit) || qubit < 0 || qubit >= qubitCount) {
    throw new Error(`Invalid ${label} ${qubit}; expected an integer in [0, ${Math.max(qubitCount - 1, 0)}].`);
  }
};

const assertFiniteRotation = (theta: number, label: string): void => {
  if (!Number.isFinite(theta)) {
    throw new Error(`Invalid ${label} ${theta}; expected a finite rotation angle.`);
  }
};

const assertValidCircuit = (circuit: ExecutableCircuit): void => {
  if (!Number.isInteger(circuit.qubitCount) || circuit.qubitCount < 0) {
    throw new Error(`Invalid qubit count ${circuit.qubitCount}; expected a non-negative integer.`);
  }

  for (const operation of circuit.operations) {
    switch (operation.kind) {
      case "rx":
        assertValidQubitIndex(operation.qubit, circuit.qubitCount, "qubit index");
        assertFiniteRotation(operation.theta, "rx theta");
        break;
      case "ry":
        assertValidQubitIndex(operation.qubit, circuit.qubitCount, "qubit index");
        assertFiniteRotation(operation.theta, "ry theta");
        break;
      case "xx":
        assertValidQubitIndex(operation.q1, circuit.qubitCount, "q1 index");
        assertValidQubitIndex(operation.q2, circuit.qubitCount, "q2 index");
        if (operation.q1 === operation.q2) {
          throw new Error(`Invalid xx operation on qubit ${operation.q1}; expected two distinct qubits.`);
        }
        assertFiniteRotation(operation.theta, "xx theta");
        break;
      default: {
        const exhaustiveCheck: never = operation;
        throw new Error(`Unsupported operation ${(exhaustiveCheck as { kind?: string }).kind ?? "unknown"}.`);
      }
    }
  }
};

const assertCapabilitySupport = (executor: CircuitExecutor, capability: ExecutorCapability): void => {
  if (!supportsCapability(executor, capability)) {
    throw new Error(`Backend "${executor.backend}" does not support executor capability "${capability}".`);
  }
};

const assertValidExecutionRequest = (
  executor: CircuitExecutor,
  { circuit, observables = [], measurement, stateVector }: ExecutionRequest,
): void => {
  assertValidCircuit(circuit);

  if (observables.length > 0) {
    assertCapabilitySupport(executor, "expectation-values");
  }

  if (stateVector) {
    assertValidStateVectorRequest(stateVector);
  }

  if (!measurement) return;

  assertCapabilitySupport(executor, "shot-sampling");

  if (measurement.kind === "all-qubits") {
    assertValidShotCount(measurement.shots);
    return;
  }

  throw new Error(`Unsupported measurement kind ${(measurement as { kind?: string }).kind ?? "unknown"}.`);
};

const assertValidStateVectorRequest = (stateVector?: StateVectorRequest): void => {
  if (!stateVector) return;
  if (stateVector.kind === "final-state-vector") return;
  throw new Error(`Unsupported state-vector request kind ${(stateVector as { kind?: string }).kind ?? "unknown"}.`);
};

const assertValidNoiseModel = (noiseModel?: NoiseModel): void => {
  if (!noiseModel || noiseModel.kind === "ideal") return;

  const probabilityEntries =
    noiseModel.kind === "depolarizing"
      ? [["depolarizing", noiseModel.probability] as const]
      : ([
          ["depolarizing", noiseModel.depolarizingProbability],
          ["amplitude damping", noiseModel.amplitudeDampingProbability],
          ["readout error", noiseModel.readoutErrorProbability],
        ] as const);

  for (const [label, value] of probabilityEntries) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`Invalid ${label} probability ${value}; expected a finite value between 0 and 1.`);
    }
  }
};

type ResolvedNoiseSettings = {
  depolarizingProbability: number;
  amplitudeDampingProbability: number;
  readoutErrorProbability: number;
};

const resolveNoiseSettings = (noiseModel?: NoiseModel): ResolvedNoiseSettings => {
  if (!noiseModel || noiseModel.kind === "ideal") {
    return {
      depolarizingProbability: 0,
      amplitudeDampingProbability: 0,
      readoutErrorProbability: 0,
    };
  }

  if (noiseModel.kind === "depolarizing") {
    return {
      depolarizingProbability: noiseModel.probability,
      amplitudeDampingProbability: 0,
      readoutErrorProbability: 0,
    };
  }

  return {
    depolarizingProbability: noiseModel.depolarizingProbability,
    amplitudeDampingProbability: noiseModel.amplitudeDampingProbability,
    readoutErrorProbability: noiseModel.readoutErrorProbability,
  };
};

const applyReadoutError = (bitstrings: string[], probability: number): string[] => {
  if (probability <= 0) return bitstrings;

  return bitstrings.map((bitstring) =>
    [...bitstring]
      .map((bit) => {
        if (Math.random() >= probability) return bit;
        return bit === "0" ? "1" : "0";
      })
      .join(""),
  );
};

const probabilityOfIndex = (sim: QuantumSimulator, index: number): number => {
  const amplitude = sim.state[index];
  return amplitude.re * amplitude.re + amplitude.im * amplitude.im;
};

const sampleAllQubits = (sim: QuantumSimulator, shots: number): string[] => {
  assertValidShotCount(shots);

  const cumulativeProbabilities: number[] = [];
  let total = 0;

  for (let i = 0; i < sim.dim; i += 1) {
    total += probabilityOfIndex(sim, i);
    cumulativeProbabilities.push(total);
  }

  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`State vector probabilities do not sum to 1 within tolerance; got ${total}.`);
  }

  return Array.from({ length: shots }, () => {
    const sample = Math.random();
    const sampledIndex = cumulativeProbabilities.findIndex((value) => sample <= value);
    const index = sampledIndex === -1 ? sim.dim - 1 : sampledIndex;
    return index.toString(2).padStart(sim.nQubits, "0");
  });
};

const evaluateObservable = (sim: QuantumSimulator, observable: Observable): number => {
  switch (observable.kind) {
    case "z":
      return sim.expZ(observable.qubit);
    case "zz":
      return sim.expZZ(observable.q1, observable.q2);
    case "xx":
      return sim.expXX(observable.q1, observable.q2);
    default: {
      const exhaustiveCheck: never = observable;
      return exhaustiveCheck;
    }
  }
};

export class DenseCpuCircuitExecutor implements CircuitExecutor {
  readonly backend = "dense-cpu" as const;
  readonly capabilities = ["ideal-execution", "expectation-values", "shot-sampling", "state-vector"] as const;

  execute({
    backend = this.backend,
    circuit,
    observables = [],
    measurement,
    stateVector,
    noiseModel,
  }: ExecutionRequest): ExecutionResult {
    if (backend !== this.backend) {
      throw new Error(`Unsupported backend "${backend}"; only "${this.backend}" is currently implemented.`);
    }

    assertValidNoiseModel(noiseModel);
    if (noiseModel && noiseModel.kind !== "ideal") {
      throw new Error(
        `Unsupported noise model "${noiseModel.kind}" for backend "${this.backend}"; only ideal execution is currently implemented.`,
      );
    }
    assertValidStateVectorRequest(stateVector);

    const sim = new QuantumSimulator(circuit.qubitCount);

    for (const operation of circuit.operations) {
      switch (operation.kind) {
        case "rx":
          sim.applyRx(operation.qubit, operation.theta);
          break;
        case "ry":
          sim.applyRy(operation.qubit, operation.theta);
          break;
        case "xx":
          sim.applyXX(operation.q1, operation.q2, operation.theta);
          break;
        default: {
          const exhaustiveCheck: never = operation;
          throw new Error(`Unsupported operation ${(exhaustiveCheck as { kind?: string }).kind ?? "unknown"}.`);
        }
      }
    }

    return {
      backend,
      expectationValues:
        observables.length > 0
          ? {
              kind: "expectation-values",
              observables,
              values: observables.map((observable) => evaluateObservable(sim, observable)),
            }
          : undefined,
      measurement:
        measurement?.kind === "all-qubits"
          ? {
              kind: "all-qubits",
              shots: measurement.shots,
              bitstrings: sampleAllQubits(sim, measurement.shots),
            }
          : undefined,
      stateVector:
        stateVector?.kind === "final-state-vector"
          ? {
              kind: "final-state-vector",
              amplitudes: sim.state.map((amplitude) => ({ re: amplitude.re, im: amplitude.im })),
            }
          : undefined,
    };
  }
}

export const denseCpuCircuitExecutor = new DenseCpuCircuitExecutor();

export class DensityCpuCircuitExecutor implements CircuitExecutor {
  readonly backend = "density-cpu" as const;
  readonly capabilities = ["ideal-execution", "expectation-values", "shot-sampling"] as const;

  execute({
    backend = this.backend,
    circuit,
    observables = [],
    measurement,
    stateVector,
    noiseModel,
  }: ExecutionRequest): ExecutionResult {
    if (backend !== this.backend) {
      throw new Error(`Unsupported backend "${backend}"; only "${this.backend}" is currently implemented.`);
    }

    assertValidNoiseModel(noiseModel);
    assertValidStateVectorRequest(stateVector);
    if (stateVector) {
      throw new Error(`Backend "${this.backend}" does not support executor capability "state-vector".`);
    }

    const sim = new DensityMatrixSimulator(circuit.qubitCount);
    const resolvedNoise = resolveNoiseSettings(noiseModel);

    const maybeApplyNoise = (qubits: number[]): void => {
      for (const qubit of qubits) {
        sim.applySingleQubitDepolarizing(qubit, resolvedNoise.depolarizingProbability);
        sim.applySingleQubitAmplitudeDamping(qubit, resolvedNoise.amplitudeDampingProbability);
      }
    };

    for (const operation of circuit.operations) {
      switch (operation.kind) {
        case "rx":
          sim.applyRx(operation.qubit, operation.theta);
          maybeApplyNoise([operation.qubit]);
          break;
        case "ry":
          sim.applyRy(operation.qubit, operation.theta);
          maybeApplyNoise([operation.qubit]);
          break;
        case "xx":
          sim.applyXX(operation.q1, operation.q2, operation.theta);
          maybeApplyNoise([operation.q1, operation.q2]);
          break;
        default: {
          const exhaustiveCheck: never = operation;
          throw new Error(`Unsupported operation ${(exhaustiveCheck as { kind?: string }).kind ?? "unknown"}.`);
        }
      }
    }

    return {
      backend,
      expectationValues:
        observables.length > 0
          ? {
              kind: "expectation-values",
              observables,
              values: observables.map((observable) => {
                switch (observable.kind) {
                  case "z":
                    return sim.expZ(observable.qubit);
                  case "zz":
                    return sim.expZZ(observable.q1, observable.q2);
                  case "xx":
                    return sim.expXX(observable.q1, observable.q2);
                  default: {
                    const exhaustiveCheck: never = observable;
                    return exhaustiveCheck;
                  }
                }
              }),
            }
          : undefined,
      measurement:
        measurement?.kind === "all-qubits"
          ? {
              kind: "all-qubits",
              shots: measurement.shots,
              bitstrings: applyReadoutError(
                probabilitiesToBitstrings(sim.measurementProbabilities(), circuit.qubitCount, measurement.shots),
                resolvedNoise.readoutErrorProbability,
              ),
            }
          : undefined,
    };
  }
}

export const densityCpuCircuitExecutor = new DensityCpuCircuitExecutor();

export const getCircuitExecutor = (backend: BackendKind): CircuitExecutor => {
  switch (backend) {
    case "dense-cpu":
      return denseCpuCircuitExecutor;
    case "density-cpu":
      return densityCpuCircuitExecutor;
    default: {
      const exhaustiveCheck: never = backend;
      throw new Error(`Unsupported backend \"${exhaustiveCheck}\".`);
    }
  }
};

export const executeCircuit = (request: ExecutionRequest): ExecutionResult => {
  const backend = request.backend ?? "dense-cpu";
  const executor = getCircuitExecutor(backend);
  const normalizedRequest = { ...request, backend };

  assertValidExecutionRequest(executor, normalizedRequest);
  if (normalizedRequest.stateVector) {
    assertCapabilitySupport(executor, "state-vector");
  }
  return executor.execute(normalizedRequest);
};

export const evaluateCircuitObservables = (
  circuit: ExecutableCircuit,
  observables: Observable[],
  backend: BackendKind = "dense-cpu",
  noiseModel?: NoiseModel,
): number[] => executeCircuit({ backend, circuit, observables, noiseModel }).expectationValues?.values ?? [];

export const sampleCircuitBitstrings = (
  circuit: ExecutableCircuit,
  shots: number,
  backend: BackendKind = "dense-cpu",
  noiseModel?: NoiseModel,
): string[] => {
  const result = executeCircuit({
    backend,
    circuit,
    measurement: { kind: "all-qubits", shots },
    noiseModel,
  });

  return result.measurement?.bitstrings ?? [];
};

export const getCircuitStateVector = (
  circuit: ExecutableCircuit,
  backend: BackendKind = "dense-cpu",
): ComplexAmplitude[] => {
  const result = executeCircuit({
    backend,
    circuit,
    stateVector: { kind: "final-state-vector" },
  });

  return result.stateVector?.amplitudes ?? [];
};
