import { describe, expect, it } from "vitest";
import type { MoleculeKey } from "../data/molecules";
import {
  sampleQaoaMeasurementEstimate,
  sampleVqeMeasurementEstimate,
  computeQaoaObjectiveGradients,
  computeVqeObjectiveGradients,
  evaluateQaoaCost,
  evaluateVqeEnergy,
} from "./algorithms";
import { QuantumSimulator } from "./quantumSimulator";

const createSeededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

const buildRandomAngles = (seed: number, count: number): number[] => {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => (random() * 2 - 1) * Math.PI);
};

const buildRandomEdgeList = (seed: number, nodeCount: number): string[] => {
  const random = createSeededRandom(seed);
  const edges: string[] = [];

  for (let q1 = 0; q1 < nodeCount; q1 += 1) {
    for (let q2 = q1 + 1; q2 < nodeCount; q2 += 1) {
      if (random() < 0.6) {
        edges.push(`${q1}-${q2}`);
      }
    }
  }

  return edges.length > 0 ? edges : ["0-1"];
};

describe("QuantumSimulator", () => {
  it("rejects out-of-range qubit indices", () => {
    const sim = new QuantumSimulator(2);

    expect(() => sim.applyRx(2, Math.PI / 4)).toThrow(/invalid qubit index/i);
    expect(() => sim.expZ(3)).toThrow(/invalid qubit index/i);
    expect(() => sim.applyXX(0, 0, Math.PI / 4)).toThrow(/distinct qubits/i);
  });
});

describe("evaluateQaoaCost", () => {
  it("rejects edges that reference qubits outside the graph", () => {
    expect(() => evaluateQaoaCost(2, ["0-2"], [0.7], [0.35])).toThrow(/invalid edge/i);
  });

  it("rejects malformed edge strings", () => {
    expect(() => evaluateQaoaCost(3, ["-1-2"], [0.7], [0.35])).toThrow(/expected format/i);
  });

  it("matches the current QAOA cost baseline for representative parameters", () => {
    expect(evaluateQaoaCost(4, ["0-1", "1-2", "2-3", "3-0"], [0.7, 0.2], [0.35, 0.15])).toBeCloseTo(
      0.9637691433204479,
      12,
    );
    expect(evaluateQaoaCost(3, ["0-1", "1-2"], [0.4], [0.1])).toBeCloseTo(0.854338772396015, 12);
  });

  it("matches the current QAOA gradient baseline", () => {
    const gradients = computeQaoaObjectiveGradients(3, ["0-1", "1-2"], [0.4], [0.1]);

    expect(gradients.gammaGrads).toHaveLength(1);
    expect(gradients.betaGrads).toHaveLength(1);
    expect(gradients.gammaGrads[0]).toBeCloseTo(0.31499420863952476, 12);
    expect(gradients.betaGrads[0]).toBeCloseTo(1.378084805037461, 12);
  });

  it("matches density-cpu in ideal mode across deterministic randomized QAOA inputs", () => {
    const cases = [
      { seed: 211, nodeCount: 2, depth: 1 },
      { seed: 223, nodeCount: 3, depth: 1 },
      { seed: 227, nodeCount: 3, depth: 2 },
      { seed: 229, nodeCount: 4, depth: 2 },
      { seed: 233, nodeCount: 4, depth: 3 },
    ];

    for (const testCase of cases) {
      const edges = buildRandomEdgeList(testCase.seed, testCase.nodeCount);
      const gammas = buildRandomAngles(testCase.seed + 1, testCase.depth);
      const betas = buildRandomAngles(testCase.seed + 2, testCase.depth);

      const denseCost = evaluateQaoaCost(testCase.nodeCount, edges, gammas, betas, "dense-cpu");
      const densityCost = evaluateQaoaCost(testCase.nodeCount, edges, gammas, betas, "density-cpu");
      const denseGradients = computeQaoaObjectiveGradients(
        testCase.nodeCount,
        edges,
        gammas,
        betas,
        "dense-cpu",
      );
      const densityGradients = computeQaoaObjectiveGradients(
        testCase.nodeCount,
        edges,
        gammas,
        betas,
        "density-cpu",
      );

      expect(densityCost, `seed=${testCase.seed} cost`).toBeCloseTo(denseCost, 9);
      expect(densityGradients.gammaGrads).toHaveLength(denseGradients.gammaGrads.length);
      expect(densityGradients.betaGrads).toHaveLength(denseGradients.betaGrads.length);

      densityGradients.gammaGrads.forEach((value, index) => {
        expect(value, `seed=${testCase.seed} gammaGrad[${index}]`).toBeCloseTo(denseGradients.gammaGrads[index]!, 9);
      });
      densityGradients.betaGrads.forEach((value, index) => {
        expect(value, `seed=${testCase.seed} betaGrad[${index}]`).toBeCloseTo(denseGradients.betaGrads[index]!, 9);
      });
    }
  });

  it("moves QAOA cost toward the unstructured baseline under stronger depolarizing noise", () => {
    const noiseLevels = [0, 0.05, 0.15, 0.3] as const;
    const values = noiseLevels.map((probability) =>
      evaluateQaoaCost(
        2,
        ["0-1"],
        [0.7],
        [0.35],
        "density-cpu",
        probability === 0 ? { kind: "ideal" } : { kind: "depolarizing", probability },
      ),
    );

    expect(values[0]).toBeCloseTo(0.18257792702891362, 12);
    expect(values[1]!).toBeGreaterThan(values[0]!);
    expect(values[2]!).toBeGreaterThan(values[1]!);
    expect(values[3]!).toBeGreaterThan(values[2]!);
    expect(Math.abs(values[3]! - 0.5)).toBeLessThan(Math.abs(values[0]! - 0.5));
  });

  it("makes noisy QAOA shot estimates converge toward the exact noisy density value", () => {
    const random = createSeededRandom(12345);
    const noiseModel = { kind: "depolarizing", probability: 0.15 } as const;
    const exact = evaluateQaoaCost(2, ["0-1"], [0.7], [0.35], "density-cpu", noiseModel);

    const originalRandom = Math.random;
    try {
      Math.random = random;
      const sampled = sampleQaoaMeasurementEstimate(2, ["0-1"], [0.7], [0.35], 4096, "density-cpu", noiseModel);
      expect(sampled.estimatedValue).toBeCloseTo(exact, 1);
      expect(sampled.totalShotsUsed).toBe(4096);
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe("evaluateVqeEnergy", () => {
  it("matches the current VQE energy baseline for representative molecules", () => {
    expect(evaluateVqeEnergy([0.25, 0.125, 0.08333333333333333, 0.0625], "H2_0.74")).toBeCloseTo(
      -1.057439901983342,
      12,
    );
    expect(evaluateVqeEnergy([0.2, -0.3, 0.4, -0.1], "HeH")).toBeCloseTo(-2.9849064801934384, 12);
  });

  it("matches the current VQE gradient baseline", () => {
    const gradients = computeVqeObjectiveGradients([0.2, -0.3, 0.4, -0.1], "HeH");

    expect(gradients).toHaveLength(4);
    expect(gradients[0]).toBeCloseTo(-0.16093626503144165, 12);
    expect(gradients[1]).toBeCloseTo(0.05999962889059174, 12);
    expect(gradients[2]).toBeCloseTo(-0.1956950580014687, 12);
    expect(gradients[3]).toBeCloseTo(0.030503401541742914, 12);
  });

  it("matches density-cpu in ideal mode across deterministic randomized VQE inputs", () => {
    const cases: Array<{ seed: number; depth: number; molecule: MoleculeKey }> = [
      { seed: 307, depth: 1, molecule: "H2_0.74" },
      { seed: 311, depth: 2, molecule: "H2_0.74" },
      { seed: 313, depth: 2, molecule: "HeH" },
      { seed: 317, depth: 3, molecule: "HeH" },
    ];

    for (const testCase of cases) {
      const thetas = buildRandomAngles(testCase.seed, testCase.depth * 2);
      const denseEnergy = evaluateVqeEnergy(thetas, testCase.molecule, "dense-cpu");
      const densityEnergy = evaluateVqeEnergy(thetas, testCase.molecule, "density-cpu");
      const denseGradients = computeVqeObjectiveGradients(thetas, testCase.molecule, "dense-cpu");
      const densityGradients = computeVqeObjectiveGradients(thetas, testCase.molecule, "density-cpu");

      expect(densityEnergy, `seed=${testCase.seed} energy`).toBeCloseTo(denseEnergy, 9);
      expect(densityGradients).toHaveLength(denseGradients.length);
      densityGradients.forEach((value, index) => {
        expect(value, `seed=${testCase.seed} thetaGrad[${index}]`).toBeCloseTo(denseGradients[index]!, 9);
      });
    }
  });

  it("makes representative VQE energies less favorable under stronger depolarizing noise", () => {
    const noiseLevels = [0, 0.05, 0.15, 0.3] as const;
    const values = noiseLevels.map((probability) =>
      evaluateVqeEnergy(
        [0.2, -0.3, 0.4, -0.1],
        "HeH",
        "density-cpu",
        probability === 0 ? { kind: "ideal" } : { kind: "depolarizing", probability },
      ),
    );

    expect(values[1]!).toBeGreaterThan(values[0]!);
    expect(values[2]!).toBeGreaterThan(values[1]!);
    expect(values[3]!).toBeGreaterThan(values[2]!);
  });

  it("makes noisy VQE shot estimates converge toward the exact noisy density value", () => {
    const random = createSeededRandom(67890);
    const noiseModel = { kind: "depolarizing", probability: 0.15 } as const;
    const thetas = [0.2, -0.3, 0.4, -0.1];
    const exact = evaluateVqeEnergy(thetas, "HeH", "density-cpu", noiseModel);

    const originalRandom = Math.random;
    try {
      Math.random = random;
      const sampled = sampleVqeMeasurementEstimate(thetas, "HeH", 4096, "density-cpu", noiseModel);
      expect(sampled.estimatedValue).toBeCloseTo(exact, 1);
      expect(sampled.totalShotsUsed).toBe(8192);
    } finally {
      Math.random = originalRandom;
    }
  });
});
