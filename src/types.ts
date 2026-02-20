export type Algorithm = "qaoa" | "vqe";
export type CircuitMode = "logical" | "transpiled";

export type GateVisual = {
  qubit: number;
  label: string;
  param?: number;
  pairWith?: number;
  tone: string;
};

export type CircuitColumn = { gates: GateVisual[] };
