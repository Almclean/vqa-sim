import { afterEach, describe, expect, it, vi } from "vitest";
import {
  estimateQaoaCostFromBitstrings,
  estimateVqeEnergyFromMeasurementBitstrings,
  sampleQaoaBitstrings,
  sampleQaoaMeasurementEstimate,
  sampleVqeBitstrings,
  sampleVqeMeasurementEstimate,
} from "./algorithms";
import {
  denseCpuCircuitExecutor,
  evaluateCircuitObservables,
  executeCircuit,
  getCircuitStateVector,
  getCircuitExecutor,
  sampleCircuitBitstrings,
  supportsCapability,
  type ExecutableCircuit,
} from "./circuitExecutor";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DenseCpuCircuitExecutor", () => {
  it("exposes backend metadata and capabilities", () => {
    expect(denseCpuCircuitExecutor.backend).toBe("dense-cpu");
    expect(denseCpuCircuitExecutor.capabilities).toEqual([
      "ideal-execution",
      "expectation-values",
      "shot-sampling",
      "state-vector",
    ]);
    expect(supportsCapability(denseCpuCircuitExecutor, "ideal-execution")).toBe(true);
    expect(supportsCapability(denseCpuCircuitExecutor, "expectation-values")).toBe(true);
    expect(supportsCapability(denseCpuCircuitExecutor, "shot-sampling")).toBe(true);
    expect(supportsCapability(denseCpuCircuitExecutor, "state-vector")).toBe(true);
    expect(getCircuitExecutor("dense-cpu")).toBe(denseCpuCircuitExecutor);
  });

  it("executes circuits through the backend-agnostic entrypoint", () => {
    const result = executeCircuit({
      circuit: {
        qubitCount: 1,
        operations: [{ kind: "rx", qubit: 0, theta: Math.PI }],
      },
      observables: [{ kind: "z", qubit: 0 }],
      measurement: { kind: "all-qubits", shots: 2 },
    });

    expect(result.backend).toBe("dense-cpu");
    expect(result.expectationValues?.kind).toBe("expectation-values");
    expect(result.expectationValues?.values[0]).toBeCloseTo(-1, 12);
    expect(result.measurement?.kind).toBe("all-qubits");
    expect(result.measurement?.shots).toBe(2);
    expect(result.measurement?.bitstrings).toEqual(["1", "1"]);
  });

  it("evaluates observables for a compiled circuit", () => {
    const result = denseCpuCircuitExecutor.execute({
      circuit: {
        qubitCount: 2,
        operations: [
          { kind: "rx", qubit: 0, theta: Math.PI },
          { kind: "ry", qubit: 1, theta: Math.PI / 2 },
        ],
      },
      observables: [
        { kind: "z", qubit: 0 },
        { kind: "z", qubit: 1 },
        { kind: "zz", q1: 0, q2: 1 },
      ],
    });

    expect(result.backend).toBe("dense-cpu");
    expect(result.expectationValues?.observables).toEqual([
      { kind: "z", qubit: 0 },
      { kind: "z", qubit: 1 },
      { kind: "zz", q1: 0, q2: 1 },
    ]);
    expect(result.expectationValues?.values[0]).toBeCloseTo(-1, 12);
    expect(result.expectationValues?.values[1]).toBeCloseTo(0, 12);
    expect(result.expectationValues?.values[2]).toBeCloseTo(0, 12);
  });

  it("samples all-qubit measurements for deterministic basis states", () => {
    const result = denseCpuCircuitExecutor.execute({
      circuit: {
        qubitCount: 2,
        operations: [
          { kind: "rx", qubit: 0, theta: Math.PI },
          { kind: "rx", qubit: 1, theta: Math.PI },
        ],
      },
      measurement: {
        kind: "all-qubits",
        shots: 3,
      },
    });

    expect(result.measurement?.kind).toBe("all-qubits");
    expect(result.measurement?.shots).toBe(3);
    expect(result.measurement?.bitstrings).toEqual(["11", "11", "11"]);
  });

  it("accepts an explicit ideal noise model", () => {
    const result = denseCpuCircuitExecutor.execute({
      circuit: {
        qubitCount: 1,
        operations: [{ kind: "ry", qubit: 0, theta: Math.PI / 2 }],
      },
      observables: [{ kind: "z", qubit: 0 }],
      noiseModel: { kind: "ideal" },
    });

    expect(result.expectationValues?.values[0]).toBeCloseTo(0, 12);
  });

  it("returns a final state vector when explicitly requested", () => {
    const result = executeCircuit({
      circuit: {
        qubitCount: 1,
        operations: [{ kind: "rx", qubit: 0, theta: Math.PI }],
      },
      stateVector: { kind: "final-state-vector" },
    });

    expect(result.stateVector?.kind).toBe("final-state-vector");
    expect(result.stateVector?.amplitudes).toHaveLength(2);
    expect(result.stateVector?.amplitudes[0]?.re).toBeCloseTo(0, 12);
    expect(result.stateVector?.amplitudes[0]?.im).toBeCloseTo(0, 12);
    expect(result.stateVector?.amplitudes[1]?.re).toBeCloseTo(0, 12);
    expect(result.stateVector?.amplitudes[1]?.im).toBeCloseTo(-1, 12);
  });

  it("rejects unsupported noisy execution requests", () => {
    expect(() =>
      denseCpuCircuitExecutor.execute({
        circuit: {
          qubitCount: 1,
          operations: [],
        },
        noiseModel: {
          kind: "depolarizing",
          probability: 0.05,
        },
      }),
    ).toThrow(/unsupported noise model/i);
  });

  it("rejects invalid depolarizing probabilities", () => {
    expect(() =>
      denseCpuCircuitExecutor.execute({
        circuit: {
          qubitCount: 1,
          operations: [],
        },
        noiseModel: {
          kind: "depolarizing",
          probability: 1.5,
        },
      }),
    ).toThrow(/invalid depolarizing probability/i);
  });

  it("rejects out-of-range circuit operations before execution", () => {
    expect(() =>
      executeCircuit({
        circuit: {
          qubitCount: 1,
          operations: [{ kind: "rx", qubit: 1, theta: 0.25 }],
        },
      }),
    ).toThrow(/invalid qubit index/i);
  });

  it("rejects self-paired xx operations", () => {
    expect(() =>
      executeCircuit({
        circuit: {
          qubitCount: 2,
          operations: [{ kind: "xx", q1: 0, q2: 0, theta: Math.PI / 4 }],
        },
      }),
    ).toThrow(/expected two distinct qubits/i);
  });

  it("rejects non-finite rotation parameters", () => {
    expect(() =>
      executeCircuit({
        circuit: {
          qubitCount: 1,
          operations: [{ kind: "ry", qubit: 0, theta: Number.NaN }],
        },
      }),
    ).toThrow(/finite rotation angle/i);
  });
});

describe("sampleCircuitBitstrings", () => {
  const equalSuperpositionCircuit: ExecutableCircuit = {
    qubitCount: 2,
    operations: [
      { kind: "ry", qubit: 0, theta: Math.PI / 2 },
      { kind: "ry", qubit: 1, theta: Math.PI / 2 },
    ],
  };

  it("returns sampled basis states in cumulative probability order", () => {
    const samples = [0.1, 0.3, 0.6, 0.9];
    vi.spyOn(Math, "random").mockImplementation(() => samples.shift() ?? 0.1);

    expect(sampleCircuitBitstrings(equalSuperpositionCircuit, 4)).toEqual(["00", "01", "10", "11"]);
  });

  it("rejects invalid shot counts", () => {
    expect(() => sampleCircuitBitstrings(equalSuperpositionCircuit, 0)).toThrow(/invalid shot count/i);
  });

  it("evaluates observables through the capability-specific helper", () => {
    expect(
      evaluateCircuitObservables(
        {
          qubitCount: 1,
          operations: [{ kind: "rx", qubit: 0, theta: Math.PI }],
        },
        [{ kind: "z", qubit: 0 }],
      ),
    ).toEqual([-1]);
  });

  it("returns a copied state vector through the state helper", () => {
    const amplitudes = getCircuitStateVector({
      qubitCount: 1,
      operations: [{ kind: "ry", qubit: 0, theta: Math.PI / 2 }],
    });

    expect(amplitudes).toHaveLength(2);
    expect(amplitudes[0]?.re).toBeCloseTo(Math.SQRT1_2, 12);
    expect(amplitudes[0]?.im).toBeCloseTo(0, 12);
    expect(amplitudes[1]?.re).toBeCloseTo(Math.SQRT1_2, 12);
    expect(amplitudes[1]?.im).toBeCloseTo(0, 12);
  });
});

describe("shot-based algorithm helpers", () => {
  it("samples QAOA bitstrings through the execution helper", () => {
    const samples = [0.1, 0.3, 0.6, 0.9];
    vi.spyOn(Math, "random").mockImplementation(() => samples.shift() ?? 0.1);

    expect(sampleQaoaBitstrings(2, [], [], [], 4)).toEqual(["00", "01", "10", "11"]);
  });

  it("estimates QAOA cut values from measured bitstrings", () => {
    expect(estimateQaoaCostFromBitstrings(2, ["0-1"], ["00", "01", "11", "10"])).toBeCloseTo(0.5, 12);

    const samples = [0.1, 0.3, 0.6, 0.9];
    vi.spyOn(Math, "random").mockImplementation(() => samples.shift() ?? 0.1);

    expect(sampleQaoaMeasurementEstimate(2, ["0-1"], [], [], 4)).toEqual({
      bitstrings: ["00", "01", "10", "11"],
      estimatedValue: 0.5,
      totalShotsUsed: 4,
    });
  });

  it("samples VQE bitstrings through the execution helper", () => {
    expect(sampleVqeBitstrings([], 3)).toEqual(["00", "00", "00"]);
  });

  it("estimates VQE energy from basis-sampled observables", () => {
    expect(estimateVqeEnergyFromMeasurementBitstrings("H2_0.74", ["00", "01", "11", "10"], ["00", "11"]))
      .toBeCloseTo(-0.871442, 6);
  });

  it("returns both histogram samples and sampled VQE estimates", () => {
    const samples = [0.1, 0.1, 0.1, 0.9];
    vi.spyOn(Math, "random").mockImplementation(() => samples.shift() ?? 0.1);

    expect(sampleVqeMeasurementEstimate([], "H2_0.74", 2)).toEqual({
      bitstrings: ["00", "00"],
      estimatedValue: -0.8827221,
      totalShotsUsed: 4,
    });
  });
});
