export const edgeKey = (a: number, b: number): string => {
  const x = Math.min(a, b);
  const y = Math.max(a, b);
  return `${x}-${y}`;
};

export const parseEdge = (key: string): [number, number] => {
  const [a, b] = key.split("-").map((v) => Number(v));
  return [a, b];
};

export const parseAndValidateEdge = (key: string, nodeCount: number): [number, number] => {
  const match = key.match(/^(\d+)-(\d+)$/);
  if (!match) {
    throw new Error(`Invalid edge "${key}": expected format "a-b" with non-negative integer endpoints.`);
  }

  const a = Number(match[1]);
  const b = Number(match[2]);

  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new Error(`Invalid edge "${key}": endpoints must be integers.`);
  }

  if (a === b) {
    throw new Error(`Invalid edge "${key}": self-loops are not supported.`);
  }

  if (a < 0 || b < 0 || a >= nodeCount || b >= nodeCount) {
    throw new Error(`Invalid edge "${key}": endpoints must be between 0 and ${nodeCount - 1}.`);
  }

  return [a, b];
};

export const filterEdgesForNodeCount = (edges: string[], nodeCount: number): string[] =>
  edges.filter((key) => {
    const [a, b] = parseEdge(key);
    return a >= 0 && b >= 0 && a < nodeCount && b < nodeCount;
  });

export const resizeArray = (prev: number[], size: number, seed: (idx: number) => number): number[] =>
  Array.from({ length: size }, (_, i) => (Number.isFinite(prev[i]) ? prev[i] : seed(i)));

export const formatParam = (value?: number): string => {
  if (!Number.isFinite(value ?? NaN)) return "";
  return (value as number).toFixed(2);
};

export const makeDefaultGammas = (depth: number): number[] => Array.from({ length: depth }, (_, i) => 0.7 / (i + 1));
export const makeDefaultBetas = (depth: number): number[] => Array.from({ length: depth }, (_, i) => 0.35 / (i + 1));
export const makeDefaultThetas = (depth: number): number[] => Array.from({ length: depth * 2 }, (_, i) => 0.25 / (i + 1));
