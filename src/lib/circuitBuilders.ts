import type { CircuitColumn, CircuitMode } from "../types";
import { parseEdge } from "./utils";

export const buildQaoaCircuit = (
  mode: CircuitMode,
  nodeCount: number,
  edges: string[],
  gammas: number[],
  betas: number[],
): CircuitColumn[] => {
  const columns: CircuitColumn[] = [];
  const edgePairs = edges.map(parseEdge);
  const layers = Math.max(gammas.length, betas.length);

  columns.push({
    gates: Array.from({ length: nodeCount }, (_, q) =>
      mode === "logical"
        ? { qubit: q, label: "H", tone: "#334155" }
        : { qubit: q, label: "Ry", param: Math.PI / 2, tone: "#0f766e" },
    ),
  });

  for (let l = 0; l < layers; l += 1) {
    const gamma = gammas[l] ?? 0;
    const beta = betas[l] ?? 0;

    if (mode === "logical") {
      for (const [a, b] of edgePairs) {
        columns.push({
          gates: [
            { qubit: a, label: "ZZ", param: gamma, pairWith: b, tone: "#7c3aed" },
            { qubit: b, label: "ZZ", param: gamma, pairWith: a, tone: "#7c3aed" },
          ],
        });
      }
    } else {
      for (const [a, b] of edgePairs) {
        columns.push({
          gates: [
            { qubit: a, label: "Ry", param: Math.PI / 2, pairWith: b, tone: "#0f766e" },
            { qubit: b, label: "Ry", param: Math.PI / 2, pairWith: a, tone: "#0f766e" },
          ],
        });
        columns.push({
          gates: [
            { qubit: a, label: "XX", param: gamma, pairWith: b, tone: "#7c3aed" },
            { qubit: b, label: "XX", param: gamma, pairWith: a, tone: "#7c3aed" },
          ],
        });
        columns.push({
          gates: [
            { qubit: a, label: "Ry", param: -Math.PI / 2, pairWith: b, tone: "#0f766e" },
            { qubit: b, label: "Ry", param: -Math.PI / 2, pairWith: a, tone: "#0f766e" },
          ],
        });
      }
    }

    columns.push({
      gates: Array.from({ length: nodeCount }, (_, q) => ({
        qubit: q,
        label: "Rx",
        param: 2 * beta,
        tone: "#b45309",
      })),
    });
  }

  return columns;
};

export const buildVqeCircuit = (mode: CircuitMode, thetas: number[]): CircuitColumn[] => {
  const columns: CircuitColumn[] = [];
  const layers = Math.floor(thetas.length / 2);

  for (let l = 0; l < layers; l += 1) {
    columns.push({
      gates: [
        { qubit: 0, label: "Ry", param: thetas[2 * l] ?? 0, tone: "#0f766e" },
        { qubit: 1, label: "Ry", param: thetas[2 * l + 1] ?? 0, tone: "#0f766e" },
      ],
    });

    if (mode === "logical") {
      columns.push({
        gates: [
          { qubit: 0, label: "CNOT", pairWith: 1, tone: "#9333ea" },
          { qubit: 1, label: "CNOT", pairWith: 0, tone: "#9333ea" },
        ],
      });
    } else {
      columns.push({
        gates: [
          { qubit: 0, label: "XX", param: Math.PI / 4, pairWith: 1, tone: "#7c3aed" },
          { qubit: 1, label: "XX", param: Math.PI / 4, pairWith: 0, tone: "#7c3aed" },
        ],
      });
    }
  }

  return columns;
};
