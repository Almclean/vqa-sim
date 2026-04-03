import { describe, expect, it } from "vitest";
import { buildQaoaExecutionCircuit, buildVqeExecutionCircuit } from "./algorithms";
import { buildIonQCreateJobBody, decodeIonQResultsToSamplingResult } from "./ionqApi";

describe("ionqApi", () => {
  it("builds a QAOA single-circuit job body in IonQ QIS format", () => {
    const request = {
      targetId: "ionq-simulator" as const,
      circuit: buildQaoaExecutionCircuit(2, [[0, 1]], [0.4], [0.2]),
      algorithm: "qaoa" as const,
      shots: 64,
      nodeCount: 2,
      edges: ["0-1"],
      gammas: [0.4],
      betas: [0.2],
    };

    const body = buildIonQCreateJobBody(request, "simulator");

    expect(body.target).toBe("simulator");
    expect(body.input).toMatchObject({
      format: "ionq.circuit.v0",
      gateset: "qis",
      qubits: 2,
    });
    expect("circuit" in body.input).toBe(true);
    if ("circuit" in body.input) {
      expect(body.input.circuit).toContainEqual({ gate: "ry", target: 0, rotation: Math.PI / 2 });
      expect(body.input.circuit).toContainEqual({ gate: "rx", target: 0, rotation: 0.4 });
      expect(body.input.circuit).toContainEqual({ gate: "rz", target: 1, rotation: 0.4 });
    }
  });

  it("builds a VQE multicircuit payload with separate z and xx measurement bases", () => {
    const request = {
      targetId: "ionq-qpu" as const,
      circuit: buildVqeExecutionCircuit([0.3, 0.1]),
      algorithm: "vqe" as const,
      shots: 32,
      thetas: [0.3, 0.1],
      molecule: "H2_0.74" as const,
    };

    const body = buildIonQCreateJobBody(request, "qpu.aria-1");

    expect(body.target).toBe("qpu.aria-1");
    expect("circuits" in body.input).toBe(true);
    if ("circuits" in body.input) {
      expect(body.input.circuits).toHaveLength(2);
      expect(body.input.circuits[0]?.name).toBe("z-basis");
      expect(body.input.circuits[1]?.name).toBe("xx-basis");
      expect(body.input.circuits[1]?.circuit.slice(-2)).toEqual([
        { gate: "ry", target: 0, rotation: -Math.PI / 2 },
        { gate: "ry", target: 1, rotation: -Math.PI / 2 },
      ]);
    }
  });

  it("decodes IonQ multicircuit probability maps into the shared sampling result shape", () => {
    const request = {
      targetId: "ionq-simulator" as const,
      circuit: buildVqeExecutionCircuit([]),
      algorithm: "vqe" as const,
      shots: 8,
      thetas: [],
      molecule: "H2_0.74" as const,
    };

    const result = decodeIonQResultsToSamplingResult(
      request,
      {
        "child-z": { "0": 0.5, "3": 0.5 },
        "child-xx": { "0": 1 },
      },
      ["child-z", "child-xx"],
    );

    expect(result.totalShotsUsed).toBe(16);
    expect(result.bitstrings).toHaveLength(8);
    expect(result.bitstrings.every((bitstring) => bitstring === "00" || bitstring === "11")).toBe(true);
    expect(typeof result.estimate).toBe("number");
  });
});
