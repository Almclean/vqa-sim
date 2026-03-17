import { describe, expect, it } from "vitest";
import { evaluateQaoaCost } from "./algorithms";
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
});
