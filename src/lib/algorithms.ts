import { MOLECULES, type MoleculeKey } from "../data/molecules";
import type { Algorithm } from "../types";
import {
  evaluateCircuitObservables,
  sampleCircuitBitstrings,
  type BackendKind,
  type CircuitOperation,
  type ExecutableCircuit,
  type Observable,
} from "./circuitExecutor";
import { parseAndValidateEdge } from "./utils";

type QaoaShift =
  | { kind: "gamma"; layer: number; edgeIndex: number; sign: 1 | -1 }
  | { kind: "beta"; layer: number; qubit: number; sign: 1 | -1 };

export type SampledMetricEstimate = {
  bitstrings: string[];
  estimatedValue: number;
  totalShotsUsed: number;
};

const getValidatedEdgePairs = (nodeCount: number, edges: string[]): Array<[number, number]> =>
  edges.map((edge) => parseAndValidateEdge(edge, nodeCount));

const bitAtQubit = (bitstring: string, qubit: number): 0 | 1 => {
  const charIndex = bitstring.length - 1 - qubit;
  const bit = bitstring[charIndex];
  if (bit !== "0" && bit !== "1") {
    throw new Error(`Invalid measured bitstring "${bitstring}" for qubit ${qubit}.`);
  }
  return bit === "1" ? 1 : 0;
};

const averageMeasurementEigenvalue = (bitstrings: string[], evaluator: (bitstring: string) => number): number => {
  if (bitstrings.length === 0) {
    throw new Error("Cannot estimate an observable from zero shots.");
  }
  return bitstrings.reduce((sum, bitstring) => sum + evaluator(bitstring), 0) / bitstrings.length;
};

const estimateZExpectationFromBitstrings = (bitstrings: string[], qubit: number): number =>
  averageMeasurementEigenvalue(bitstrings, (bitstring) => (bitAtQubit(bitstring, qubit) === 0 ? 1 : -1));

const estimateZZExpectationFromBitstrings = (bitstrings: string[], q1: number, q2: number): number =>
  averageMeasurementEigenvalue(bitstrings, (bitstring) => (bitAtQubit(bitstring, q1) === bitAtQubit(bitstring, q2) ? 1 : -1));

export const buildQaoaExecutionCircuit = (
  nodeCount: number,
  edges: Array<[number, number]>,
  gammas: number[],
  betas: number[],
  shift?: QaoaShift,
): ExecutableCircuit => {
  const operations: CircuitOperation[] = [];
  const layers = Math.max(gammas.length, betas.length);

  for (let q = 0; q < nodeCount; q += 1) {
    operations.push({ kind: "ry", qubit: q, theta: Math.PI / 2 });
  }

  for (let layer = 0; layer < layers; layer += 1) {
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
      const [q1, q2] = edges[edgeIndex];
      let gamma = gammas[layer] ?? 0;
      if (shift?.kind === "gamma" && shift.layer === layer && shift.edgeIndex === edgeIndex) {
        gamma += shift.sign * (Math.PI / 2);
      }

      operations.push(
        { kind: "ry", qubit: q1, theta: Math.PI / 2 },
        { kind: "ry", qubit: q2, theta: Math.PI / 2 },
        { kind: "xx", q1, q2, theta: gamma },
        { kind: "ry", qubit: q1, theta: -Math.PI / 2 },
        { kind: "ry", qubit: q2, theta: -Math.PI / 2 },
      );
    }

    const beta = betas[layer] ?? 0;
    for (let q = 0; q < nodeCount; q += 1) {
      let mixerAngle = 2 * beta;
      if (shift?.kind === "beta" && shift.layer === layer && shift.qubit === q) {
        mixerAngle += shift.sign * (Math.PI / 2);
      }
      operations.push({ kind: "rx", qubit: q, theta: mixerAngle });
    }
  }

  return {
    qubitCount: nodeCount,
    operations,
  };
};

const buildQaoaCostObservables = (edges: Array<[number, number]>): Observable[] =>
  edges.map(([q1, q2]) => ({ kind: "zz", q1, q2 }));

const evaluateQaoaObjectiveWithSingleGateShift = (
  nodeCount: number,
  edges: string[],
  gammas: number[],
  betas: number[],
  shift?: QaoaShift,
  backend: BackendKind = "dense-cpu",
): number => {
  if (nodeCount < 1) return 0;

  const edgePairs = getValidatedEdgePairs(nodeCount, edges);
  const circuit = buildQaoaExecutionCircuit(nodeCount, edgePairs, gammas, betas, shift);
  const observables = buildQaoaCostObservables(edgePairs);
  const expectationValues = evaluateCircuitObservables(circuit, observables, backend);
  const cost = expectationValues.reduce((sum, expectation) => sum + (1 - expectation) / 2, 0);
  return -cost;
};

export const evaluateQaoaCost = (
  nodeCount: number,
  edges: string[],
  gammas: number[],
  betas: number[],
  backend: BackendKind = "dense-cpu",
): number => {
  return -evaluateQaoaObjectiveWithSingleGateShift(nodeCount, edges, gammas, betas, undefined, backend);
};

export const buildVqeExecutionCircuit = (thetas: number[]): ExecutableCircuit => {
  const operations: CircuitOperation[] = [];
  const layers = Math.floor(thetas.length / 2);

  for (let layer = 0; layer < layers; layer += 1) {
    operations.push(
      { kind: "ry", qubit: 0, theta: thetas[2 * layer] ?? 0 },
      { kind: "ry", qubit: 1, theta: thetas[2 * layer + 1] ?? 0 },
      { kind: "xx", q1: 0, q2: 1, theta: Math.PI / 4 },
    );
  }

  return {
    qubitCount: 2,
    operations,
  };
};

const VQE_OBSERVABLES: [Observable, Observable, Observable, Observable] = [
  { kind: "z", qubit: 0 },
  { kind: "z", qubit: 1 },
  { kind: "zz", q1: 0, q2: 1 },
  { kind: "xx", q1: 0, q2: 1 },
];

export const evaluateVqeEnergy = (
  thetas: number[],
  moleculeKey: MoleculeKey,
  backend: BackendKind = "dense-cpu",
): number => {
  const circuit = buildVqeExecutionCircuit(thetas);
  const {
    coeffs: { g0, g1, g2, g3, g4 },
  } = MOLECULES[moleculeKey];
  const [z0, z1, zz01, xx01] = evaluateCircuitObservables(circuit, VQE_OBSERVABLES, backend);

  return g0 + g1 * z0 + g2 * z1 + g3 * zz01 + g4 * xx01;
};

export const estimateQaoaCostFromBitstrings = (nodeCount: number, edges: string[], bitstrings: string[]): number => {
  if (nodeCount < 1) return 0;
  const edgePairs = getValidatedEdgePairs(nodeCount, edges);
  if (bitstrings.length === 0 || edgePairs.length === 0) return 0;

  const totalCutSize = bitstrings.reduce(
    (sum, bitstring) =>
      sum + edgePairs.reduce((edgeSum, [q1, q2]) => edgeSum + (bitAtQubit(bitstring, q1) !== bitAtQubit(bitstring, q2) ? 1 : 0), 0),
    0,
  );

  return totalCutSize / bitstrings.length;
};

export const estimateVqeEnergyFromMeasurementBitstrings = (
  moleculeKey: MoleculeKey,
  zBasisBitstrings: string[],
  xxBasisBitstrings: string[],
): number => {
  const {
    coeffs: { g0, g1, g2, g3, g4 },
  } = MOLECULES[moleculeKey];
  const z0 = estimateZExpectationFromBitstrings(zBasisBitstrings, 0);
  const z1 = estimateZExpectationFromBitstrings(zBasisBitstrings, 1);
  const zz01 = estimateZZExpectationFromBitstrings(zBasisBitstrings, 0, 1);
  const xx01 = estimateZZExpectationFromBitstrings(xxBasisBitstrings, 0, 1);

  return g0 + g1 * z0 + g2 * z1 + g3 * zz01 + g4 * xx01;
};

export const sampleQaoaBitstrings = (
  nodeCount: number,
  edges: string[],
  gammas: number[],
  betas: number[],
  shots: number,
  backend: BackendKind = "dense-cpu",
): string[] => {
  if (nodeCount < 1) return [];

  const edgePairs = getValidatedEdgePairs(nodeCount, edges);
  const circuit = buildQaoaExecutionCircuit(nodeCount, edgePairs, gammas, betas);
  return sampleCircuitBitstrings(circuit, shots, backend);
};

export const sampleQaoaMeasurementEstimate = (
  nodeCount: number,
  edges: string[],
  gammas: number[],
  betas: number[],
  shots: number,
  backend: BackendKind = "dense-cpu",
): SampledMetricEstimate => {
  const bitstrings = sampleQaoaBitstrings(nodeCount, edges, gammas, betas, shots, backend);
  return {
    bitstrings,
    estimatedValue: estimateQaoaCostFromBitstrings(nodeCount, edges, bitstrings),
    totalShotsUsed: bitstrings.length,
  };
};

export const sampleVqeBitstrings = (
  thetas: number[],
  shots: number,
  backend: BackendKind = "dense-cpu",
): string[] => {
  const circuit = buildVqeExecutionCircuit(thetas);
  return sampleCircuitBitstrings(circuit, shots, backend);
};

export const sampleVqeMeasurementEstimate = (
  thetas: number[],
  moleculeKey: MoleculeKey,
  shots: number,
  backend: BackendKind = "dense-cpu",
): SampledMetricEstimate => {
  const zBasisBitstrings = sampleVqeBitstrings(thetas, shots, backend);
  const xxMeasurementCircuit: ExecutableCircuit = {
    qubitCount: 2,
    operations: [
      ...buildVqeExecutionCircuit(thetas).operations,
      { kind: "ry", qubit: 0, theta: -Math.PI / 2 },
      { kind: "ry", qubit: 1, theta: -Math.PI / 2 },
    ],
  };
  const xxBasisBitstrings = sampleCircuitBitstrings(xxMeasurementCircuit, shots, backend);

  return {
    bitstrings: zBasisBitstrings,
    estimatedValue: estimateVqeEnergyFromMeasurementBitstrings(moleculeKey, zBasisBitstrings, xxBasisBitstrings),
    totalShotsUsed: zBasisBitstrings.length + xxBasisBitstrings.length,
  };
};

export const evaluateObjectiveFromFlat = (
  algorithm: Algorithm,
  depth: number,
  flatParams: number[],
  nodeCount: number,
  edges: string[],
  molecule: MoleculeKey,
): number => {
  if (algorithm === "qaoa") {
    const gammas = flatParams.slice(0, depth);
    const betas = flatParams.slice(depth, depth * 2);
    return -evaluateQaoaCost(nodeCount, edges, gammas, betas);
  }
  return evaluateVqeEnergy(flatParams, molecule);
};

export const computeQaoaObjectiveGradients = (
  nodeCount: number,
  edges: string[],
  gammas: number[],
  betas: number[],
): { gammaGrads: number[]; betaGrads: number[] } => {
  const layers = Math.max(gammas.length, betas.length);
  const gammaGrads = Array.from({ length: layers }, () => 0);
  const betaGrads = Array.from({ length: layers }, () => 0);

  for (let layer = 0; layer < layers; layer += 1) {
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
      const plus = evaluateQaoaObjectiveWithSingleGateShift(nodeCount, edges, gammas, betas, {
        kind: "gamma",
        layer,
        edgeIndex,
        sign: 1,
      });
      const minus = evaluateQaoaObjectiveWithSingleGateShift(nodeCount, edges, gammas, betas, {
        kind: "gamma",
        layer,
        edgeIndex,
        sign: -1,
      });
      gammaGrads[layer] += 0.5 * (plus - minus);
    }

    for (let qubit = 0; qubit < nodeCount; qubit += 1) {
      const plus = evaluateQaoaObjectiveWithSingleGateShift(nodeCount, edges, gammas, betas, {
        kind: "beta",
        layer,
        qubit,
        sign: 1,
      });
      const minus = evaluateQaoaObjectiveWithSingleGateShift(nodeCount, edges, gammas, betas, {
        kind: "beta",
        layer,
        qubit,
        sign: -1,
      });
      betaGrads[layer] += plus - minus;
    }
  }

  return { gammaGrads, betaGrads };
};

export const computeVqeObjectiveGradients = (thetas: number[], molecule: MoleculeKey): number[] =>
  thetas.map((_, idx) => {
    const plus = [...thetas];
    const minus = [...thetas];
    plus[idx] += Math.PI / 2;
    minus[idx] -= Math.PI / 2;
    const fPlus = evaluateVqeEnergy(plus, molecule);
    const fMinus = evaluateVqeEnergy(minus, molecule);
    return 0.5 * (fPlus - fMinus);
  });
