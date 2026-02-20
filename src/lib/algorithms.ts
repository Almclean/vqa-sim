import { MOLECULES, type MoleculeKey } from "../data/molecules";
import { QuantumSimulator } from "./quantumSimulator";
import { parseEdge } from "./utils";
import type { Algorithm } from "../types";

type QaoaShift =
  | { kind: "gamma"; layer: number; edgeIndex: number; sign: 1 | -1 }
  | { kind: "beta"; layer: number; qubit: number; sign: 1 | -1 };

const evaluateQaoaObjectiveWithSingleGateShift = (
  nodeCount: number,
  edges: string[],
  gammas: number[],
  betas: number[],
  shift?: QaoaShift,
): number => {
  if (nodeCount < 1) return 0;
  const sim = new QuantumSimulator(nodeCount);
  const edgePairs = edges.map(parseEdge);
  const layers = Math.max(gammas.length, betas.length);

  for (let q = 0; q < nodeCount; q += 1) {
    sim.applyRy(q, Math.PI / 2);
  }

  for (let l = 0; l < layers; l += 1) {
    for (let e = 0; e < edgePairs.length; e += 1) {
      const [q1, q2] = edgePairs[e];
      let gamma = gammas[l] ?? 0;
      if (shift?.kind === "gamma" && shift.layer === l && shift.edgeIndex === e) {
        gamma += shift.sign * (Math.PI / 2);
      }
      sim.applyRy(q1, Math.PI / 2);
      sim.applyRy(q2, Math.PI / 2);
      sim.applyXX(q1, q2, gamma);
      sim.applyRy(q1, -Math.PI / 2);
      sim.applyRy(q2, -Math.PI / 2);
    }

    const beta = betas[l] ?? 0;
    for (let q = 0; q < nodeCount; q += 1) {
      let mixerAngle = 2 * beta;
      if (shift?.kind === "beta" && shift.layer === l && shift.qubit === q) {
        mixerAngle += shift.sign * (Math.PI / 2);
      }
      sim.applyRx(q, mixerAngle);
    }
  }

  let cost = 0;
  for (const [q1, q2] of edgePairs) {
    cost += (1 - sim.expZZ(q1, q2)) / 2;
  }
  return -cost;
};

export const evaluateQaoaCost = (nodeCount: number, edges: string[], gammas: number[], betas: number[]): number => {
  return -evaluateQaoaObjectiveWithSingleGateShift(nodeCount, edges, gammas, betas);
};

export const evaluateVqeEnergy = (thetas: number[], moleculeKey: MoleculeKey): number => {
  const sim = new QuantumSimulator(2);
  const layers = Math.floor(thetas.length / 2);

  for (let l = 0; l < layers; l += 1) {
    sim.applyRy(0, thetas[2 * l] ?? 0);
    sim.applyRy(1, thetas[2 * l + 1] ?? 0);
    sim.applyXX(0, 1, Math.PI / 4);
  }

  const { g0, g1, g2, g3, g4 } = MOLECULES[moleculeKey].coeffs;
  return g0 + g1 * sim.expZ(0) + g2 * sim.expZ(1) + g3 * sim.expZZ(0, 1) + g4 * sim.expXX(0, 1);
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

  for (let l = 0; l < layers; l += 1) {
    for (let e = 0; e < edges.length; e += 1) {
      const plus = evaluateQaoaObjectiveWithSingleGateShift(nodeCount, edges, gammas, betas, {
        kind: "gamma",
        layer: l,
        edgeIndex: e,
        sign: 1,
      });
      const minus = evaluateQaoaObjectiveWithSingleGateShift(nodeCount, edges, gammas, betas, {
        kind: "gamma",
        layer: l,
        edgeIndex: e,
        sign: -1,
      });
      gammaGrads[l] += 0.5 * (plus - minus);
    }

    for (let q = 0; q < nodeCount; q += 1) {
      const plus = evaluateQaoaObjectiveWithSingleGateShift(nodeCount, edges, gammas, betas, {
        kind: "beta",
        layer: l,
        qubit: q,
        sign: 1,
      });
      const minus = evaluateQaoaObjectiveWithSingleGateShift(nodeCount, edges, gammas, betas, {
        kind: "beta",
        layer: l,
        qubit: q,
        sign: -1,
      });
      betaGrads[l] += plus - minus;
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
