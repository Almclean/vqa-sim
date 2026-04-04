import { describe, expect, it } from "vitest";
import { DensityMatrixSimulator, maxPopulationDifference } from "./densityMatrixSimulator";
import { QuantumSimulator } from "./quantumSimulator";

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

    const densityFromStateVector = new DensityMatrixSimulator(2);
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

    expect(maxPopulationDifference(densityMatrix, densityFromStateVector)).toBeLessThan(1e-9);
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
});
