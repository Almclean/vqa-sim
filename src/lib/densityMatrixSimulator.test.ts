import { describe, expect, it, vi } from "vitest";
import { DensityMatrixSimulator, maxPopulationDifference, probabilitiesToBitstrings } from "./densityMatrixSimulator";
import { QuantumSimulator } from "./quantumSimulator";

type SimulatorStep = {
  label: string;
  apply: (simulator: QuantumSimulator | DensityMatrixSimulator) => void;
};

const buildDensityFromStateVector = (stateVector: QuantumSimulator): DensityMatrixSimulator => {
  const densityFromStateVector = new DensityMatrixSimulator(stateVector.nQubits);
  densityFromStateVector.densityMatrix = Array.from({ length: stateVector.dim }, (_, row) =>
    Array.from({ length: stateVector.dim }, (_, column) => {
      const a = stateVector.state[row]!;
      const b = stateVector.state[column]!;
      return {
        re: a.re * b.re + a.im * b.im,
        im: a.im * b.re - a.re * b.im,
      };
    }),
  );
  return densityFromStateVector;
};

describe("DensityMatrixSimulator", () => {
  it("matches the state-vector simulator on basis-state populations in ideal mode", () => {
    const stateVector = new QuantumSimulator(2);
    const densityMatrix = new DensityMatrixSimulator(2);

    stateVector.applyRy(0, Math.PI / 2);
    stateVector.applyRx(1, Math.PI / 3);
    stateVector.applyXX(0, 1, Math.PI / 4);

    densityMatrix.applyRy(0, Math.PI / 2);
    densityMatrix.applyRx(1, Math.PI / 3);
    densityMatrix.applyXX(0, 1, Math.PI / 4);

    const densityFromStateVector = buildDensityFromStateVector(stateVector);

    expect(maxPopulationDifference(densityMatrix, densityFromStateVector)).toBeLessThan(1e-9);
  });

  it("matches state-vector expectations across representative ideal circuits", () => {
    const cases: Array<{ nQubits: number; steps: SimulatorStep[] }> = [
      {
        nQubits: 1,
        steps: [{ label: "ry(0, pi/2)", apply: (simulator) => simulator.applyRy(0, Math.PI / 2) }],
      },
      {
        nQubits: 2,
        steps: [
          { label: "rx(0, pi/5)", apply: (simulator) => simulator.applyRx(0, Math.PI / 5) },
          { label: "ry(1, -pi/3)", apply: (simulator) => simulator.applyRy(1, -Math.PI / 3) },
          { label: "xx(0, 1, pi/7)", apply: (simulator) => simulator.applyXX(0, 1, Math.PI / 7) },
        ],
      },
      {
        nQubits: 2,
        steps: [
          { label: "ry(0, pi/2)", apply: (simulator) => simulator.applyRy(0, Math.PI / 2) },
          { label: "rx(1, pi/3)", apply: (simulator) => simulator.applyRx(1, Math.PI / 3) },
          { label: "xx(1, 0, -pi/4)", apply: (simulator) => simulator.applyXX(1, 0, -Math.PI / 4) },
          { label: "rx(0, pi/8)", apply: (simulator) => simulator.applyRx(0, Math.PI / 8) },
        ],
      },
    ];

    for (const testCase of cases) {
      const stateVector = new QuantumSimulator(testCase.nQubits);
      const densityMatrix = new DensityMatrixSimulator(testCase.nQubits);

      for (const step of testCase.steps) {
        step.apply(stateVector);
        step.apply(densityMatrix);
      }

      const densityFromStateVector = buildDensityFromStateVector(stateVector);
      expect(maxPopulationDifference(densityMatrix, densityFromStateVector), testCase.steps.map((step) => step.label).join(" -> "))
        .toBeLessThan(1e-9);

      for (let qubit = 0; qubit < testCase.nQubits; qubit += 1) {
        expect(densityMatrix.expZ(qubit)).toBeCloseTo(stateVector.expZ(qubit), 9);
      }

      if (testCase.nQubits > 1) {
        expect(densityMatrix.expZZ(0, 1)).toBeCloseTo(stateVector.expZZ(0, 1), 9);
        expect(densityMatrix.expXX(0, 1)).toBeCloseTo(stateVector.expXX(0, 1), 9);
      }
    }
  });

  it("applies single-qubit depolarizing noise to reduce z expectation", () => {
    const simulator = new DensityMatrixSimulator(1);
    simulator.applyRy(0, Math.PI / 2);
    const ideal = simulator.expZ(0);

    simulator.applySingleQubitDepolarizing(0, 0.3);
    const noisy = simulator.expZ(0);

    expect(Math.abs(ideal)).toBeLessThan(1e-9);
    expect(Math.abs(noisy)).toBeLessThan(1e-9);

    const basisState = new DensityMatrixSimulator(1);
    basisState.applyRx(0, Math.PI);
    const beforeNoise = basisState.expZ(0);
    basisState.applySingleQubitDepolarizing(0, 0.3);
    const afterNoise = basisState.expZ(0);

    expect(beforeNoise).toBeCloseTo(-1, 9);
    expect(afterNoise).toBeGreaterThan(beforeNoise);
    expect(afterNoise).toBeCloseTo(-0.6, 9);
  });

  it("applies single-qubit amplitude damping to relax excited-state population", () => {
    const simulator = new DensityMatrixSimulator(1);
    simulator.applyRx(0, Math.PI);

    expect(simulator.expZ(0)).toBeCloseTo(-1, 9);

    simulator.applySingleQubitAmplitudeDamping(0, 0.3);

    expect(simulator.expZ(0)).toBeCloseTo(-0.4, 9);
    expect(simulator.measurementProbabilities()).toEqual([
      expect.closeTo(0.3, 9),
      expect.closeTo(0.7, 9),
    ]);
  });

  it("preserves normalized non-negative populations under multi-qubit depolarizing noise", () => {
    const simulator = new DensityMatrixSimulator(2);
    simulator.applyRy(0, Math.PI / 2);
    simulator.applyRx(1, Math.PI / 3);
    simulator.applyXX(0, 1, Math.PI / 4);
    simulator.applySingleQubitDepolarizing(0, 0.2);
    simulator.applySingleQubitDepolarizing(1, 0.35);

    const probabilities = simulator.measurementProbabilities();
    const totalProbability = probabilities.reduce((sum, probability) => sum + probability, 0);

    expect(totalProbability).toBeCloseTo(1, 12);
    probabilities.forEach((probability) => {
      expect(probability).toBeGreaterThanOrEqual(-1e-12);
      expect(probability).toBeLessThanOrEqual(1 + 1e-12);
    });
    expect(Math.abs(simulator.expZ(0))).toBeLessThanOrEqual(1 + 1e-12);
    expect(Math.abs(simulator.expZ(1))).toBeLessThanOrEqual(1 + 1e-12);
    expect(Math.abs(simulator.expZZ(0, 1))).toBeLessThanOrEqual(1 + 1e-12);
    expect(Math.abs(simulator.expXX(0, 1))).toBeLessThanOrEqual(1 + 1e-12);
  });

  it("preserves normalized non-negative populations under mixed depolarizing and amplitude-damping noise", () => {
    const simulator = new DensityMatrixSimulator(2);
    simulator.applyRy(0, Math.PI / 2);
    simulator.applyRx(1, Math.PI / 3);
    simulator.applyXX(0, 1, Math.PI / 4);
    simulator.applySingleQubitDepolarizing(0, 0.12);
    simulator.applySingleQubitAmplitudeDamping(0, 0.08);
    simulator.applySingleQubitDepolarizing(1, 0.05);
    simulator.applySingleQubitAmplitudeDamping(1, 0.15);

    const probabilities = simulator.measurementProbabilities();
    const totalProbability = probabilities.reduce((sum, probability) => sum + probability, 0);

    expect(totalProbability).toBeCloseTo(1, 12);
    probabilities.forEach((probability) => {
      expect(probability).toBeGreaterThanOrEqual(-1e-12);
      expect(probability).toBeLessThanOrEqual(1 + 1e-12);
    });
  });
});

describe("probabilitiesToBitstrings", () => {
  it("samples bitstrings from a normalized probability vector", () => {
    const samples = [0.05, 0.35, 0.65, 0.95];
    vi.spyOn(Math, "random").mockImplementation(() => samples.shift() ?? 0.05);

    expect(probabilitiesToBitstrings([0.25, 0.25, 0.25, 0.25], 2, 4)).toEqual(["00", "01", "10", "11"]);
  });

  it("rejects non-normalized populations", () => {
    expect(() => probabilitiesToBitstrings([0.4, 0.4], 1, 2)).toThrow(/do not sum to 1/i);
  });
});
