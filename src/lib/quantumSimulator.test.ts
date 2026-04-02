import { describe, expect, it } from "vitest";
import {
  computeQaoaObjectiveGradients,
  computeVqeObjectiveGradients,
  evaluateQaoaCost,
  evaluateVqeEnergy,
} from "./algorithms";
import { QuantumSimulator } from "./quantumSimulator";

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
});

