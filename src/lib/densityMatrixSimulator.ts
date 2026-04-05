import type { ComplexAmplitude } from "./quantumSimulator";

type ComplexMatrix = ComplexAmplitude[][];

const complex = (re: number, im: number = 0): ComplexAmplitude => ({ re, im });

const cAdd = (a: ComplexAmplitude, b: ComplexAmplitude): ComplexAmplitude => ({ re: a.re + b.re, im: a.im + b.im });
const cMul = (a: ComplexAmplitude, b: ComplexAmplitude): ComplexAmplitude => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cScale = (a: ComplexAmplitude, scalar: number): ComplexAmplitude => ({ re: a.re * scalar, im: a.im * scalar });
const cConj = (a: ComplexAmplitude): ComplexAmplitude => ({ re: a.re, im: -a.im });

const zeroMatrix = (dimension: number): ComplexMatrix =>
  Array.from({ length: dimension }, () => Array.from({ length: dimension }, () => complex(0)));

const identityMatrix = (dimension: number): ComplexMatrix =>
  Array.from({ length: dimension }, (_, row) =>
    Array.from({ length: dimension }, (_, column) => complex(row === column ? 1 : 0)),
  );

const cloneMatrix = (matrix: ComplexMatrix): ComplexMatrix =>
  matrix.map((row) => row.map((entry) => ({ re: entry.re, im: entry.im })));

const matrixAdd = (a: ComplexMatrix, b: ComplexMatrix): ComplexMatrix =>
  a.map((row, rowIndex) =>
    row.map((entry, columnIndex) => cAdd(entry, b[rowIndex]?.[columnIndex] ?? complex(0))),
  );

const matrixScale = (matrix: ComplexMatrix, scalar: number): ComplexMatrix =>
  matrix.map((row) => row.map((entry) => cScale(entry, scalar)));

const matrixMultiply = (a: ComplexMatrix, b: ComplexMatrix): ComplexMatrix => {
  const dimension = a.length;
  const result = zeroMatrix(dimension);

  for (let row = 0; row < dimension; row += 1) {
    for (let column = 0; column < dimension; column += 1) {
      let total = complex(0);
      for (let inner = 0; inner < dimension; inner += 1) {
        total = cAdd(total, cMul(a[row]![inner]!, b[inner]![column]!));
      }
      result[row]![column] = total;
    }
  }

  return result;
};

const conjugateTranspose = (matrix: ComplexMatrix): ComplexMatrix => {
  const dimension = matrix.length;
  return Array.from({ length: dimension }, (_, row) =>
    Array.from({ length: dimension }, (_, column) => cConj(matrix[column]![row]!)),
  );
};

const applyUnitaryToDensityMatrix = (densityMatrix: ComplexMatrix, unitary: ComplexMatrix): ComplexMatrix =>
  matrixMultiply(matrixMultiply(unitary, densityMatrix), conjugateTranspose(unitary));

const applyKrausChannelToDensityMatrix = (densityMatrix: ComplexMatrix, operators: ComplexMatrix[]): ComplexMatrix =>
  operators.reduce(
    (sum, operator) =>
      matrixAdd(
        sum,
        matrixMultiply(matrixMultiply(operator, densityMatrix), conjugateTranspose(operator)),
      ),
    zeroMatrix(densityMatrix.length),
  );

const kron = (a: ComplexMatrix, b: ComplexMatrix): ComplexMatrix => {
  const aDimension = a.length;
  const bDimension = b.length;
  const result = zeroMatrix(aDimension * bDimension);

  for (let aRow = 0; aRow < aDimension; aRow += 1) {
    for (let aColumn = 0; aColumn < aDimension; aColumn += 1) {
      for (let bRow = 0; bRow < bDimension; bRow += 1) {
        for (let bColumn = 0; bColumn < bDimension; bColumn += 1) {
          result[aRow * bDimension + bRow]![aColumn * bDimension + bColumn] = cMul(
            a[aRow]![aColumn]!,
            b[bRow]![bColumn]!,
          );
        }
      }
    }
  }

  return result;
};

const assertValidQubitIndex = (nQubits: number, qubit: number): void => {
  if (!Number.isInteger(qubit) || qubit < 0 || qubit >= nQubits) {
    throw new Error(`Invalid qubit index ${qubit}; expected an integer between 0 and ${nQubits - 1}.`);
  }
};

const RX = (theta: number): ComplexMatrix => {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [
    [complex(c), complex(0, -s)],
    [complex(0, -s), complex(c)],
  ];
};

const RY = (theta: number): ComplexMatrix => {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [
    [complex(c), complex(-s)],
    [complex(s), complex(c)],
  ];
};

const PAULI_X: ComplexMatrix = [
  [complex(0), complex(1)],
  [complex(1), complex(0)],
];
const PAULI_Y: ComplexMatrix = [
  [complex(0), complex(0, -1)],
  [complex(0, 1), complex(0)],
];
const PAULI_Z: ComplexMatrix = [
  [complex(1), complex(0)],
  [complex(0), complex(-1)],
];

const amplitudeDampingOperators = (probability: number): [ComplexMatrix, ComplexMatrix] => [
  [
    [complex(1), complex(0)],
    [complex(0), complex(Math.sqrt(1 - probability))],
  ],
  [
    [complex(0), complex(Math.sqrt(probability))],
    [complex(0), complex(0)],
  ],
];

const XX = (theta: number): ComplexMatrix => {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [
    [complex(c), complex(0), complex(0), complex(0, -s)],
    [complex(0), complex(c), complex(0, -s), complex(0)],
    [complex(0), complex(0, -s), complex(c), complex(0)],
    [complex(0, -s), complex(0), complex(0), complex(c)],
  ];
};

const embedSingleQubitOperator = (nQubits: number, qubit: number, operator: ComplexMatrix): ComplexMatrix => {
  assertValidQubitIndex(nQubits, qubit);
  let embedded: ComplexMatrix | null = null;

  for (let currentQubit = nQubits - 1; currentQubit >= 0; currentQubit -= 1) {
    const nextOperator = currentQubit === qubit ? operator : identityMatrix(2);
    embedded = embedded ? kron(embedded, nextOperator) : nextOperator;
  }

  return embedded ?? identityMatrix(1);
};

const embedTwoQubitOperator = (nQubits: number, q1: number, q2: number, operator: ComplexMatrix): ComplexMatrix => {
  assertValidQubitIndex(nQubits, q1);
  assertValidQubitIndex(nQubits, q2);
  if (q1 === q2) {
    throw new Error("Two-qubit operators require distinct qubits.");
  }

  const lower = Math.min(q1, q2);
  const upper = Math.max(q1, q2);
  const dimension = 1 << nQubits;
  const result = zeroMatrix(dimension);

  for (let column = 0; column < dimension; column += 1) {
    const columnLower = (column >> lower) & 1;
    const columnUpper = (column >> upper) & 1;
    const columnBasis = columnLower | (columnUpper << 1);

    for (let rowBasis = 0; rowBasis < 4; rowBasis += 1) {
      const rowLower = rowBasis & 1;
      const rowUpper = (rowBasis >> 1) & 1;
      let row = column;

      if (rowLower === 1) {
        row |= 1 << lower;
      } else {
        row &= ~(1 << lower);
      }

      if (rowUpper === 1) {
        row |= 1 << upper;
      } else {
        row &= ~(1 << upper);
      }

      result[row]![column] = operator[rowBasis]![columnBasis]!;
    }
  }

  return result;
};

const observableTrace = (densityMatrix: ComplexMatrix, operator: ComplexMatrix): number => {
  const product = matrixMultiply(densityMatrix, operator);
  return product.reduce((sum, row, index) => sum + (row[index]?.re ?? 0), 0);
};

export class DensityMatrixSimulator {
  readonly nQubits: number;
  readonly dim: number;
  densityMatrix: ComplexMatrix;

  constructor(nQubits: number) {
    if (!Number.isInteger(nQubits) || nQubits < 1) {
      throw new Error(`Invalid qubit count ${nQubits}; expected a positive integer.`);
    }

    this.nQubits = nQubits;
    this.dim = 1 << nQubits;
    this.densityMatrix = zeroMatrix(this.dim);
    this.densityMatrix[0]![0] = complex(1);
  }

  clone(): DensityMatrixSimulator {
    const next = new DensityMatrixSimulator(this.nQubits);
    next.densityMatrix = cloneMatrix(this.densityMatrix);
    return next;
  }

  applyRx(qubit: number, theta: number): void {
    this.densityMatrix = applyUnitaryToDensityMatrix(
      this.densityMatrix,
      embedSingleQubitOperator(this.nQubits, qubit, RX(theta)),
    );
  }

  applyRy(qubit: number, theta: number): void {
    this.densityMatrix = applyUnitaryToDensityMatrix(
      this.densityMatrix,
      embedSingleQubitOperator(this.nQubits, qubit, RY(theta)),
    );
  }

  applyXX(q1: number, q2: number, theta: number): void {
    this.densityMatrix = applyUnitaryToDensityMatrix(
      this.densityMatrix,
      embedTwoQubitOperator(this.nQubits, q1, q2, XX(theta)),
    );
  }

  applySingleQubitDepolarizing(qubit: number, probability: number): void {
    assertValidQubitIndex(this.nQubits, qubit);
    if (probability <= 0) return;

    const embeddedX = embedSingleQubitOperator(this.nQubits, qubit, PAULI_X);
    const embeddedY = embedSingleQubitOperator(this.nQubits, qubit, PAULI_Y);
    const embeddedZ = embedSingleQubitOperator(this.nQubits, qubit, PAULI_Z);
    const mixedContribution = matrixAdd(
      matrixAdd(
        applyUnitaryToDensityMatrix(this.densityMatrix, embeddedX),
        applyUnitaryToDensityMatrix(this.densityMatrix, embeddedY),
      ),
      applyUnitaryToDensityMatrix(this.densityMatrix, embeddedZ),
    );

    this.densityMatrix = matrixAdd(
      matrixScale(this.densityMatrix, 1 - probability),
      matrixScale(mixedContribution, probability / 3),
    );
  }

  applySingleQubitAmplitudeDamping(qubit: number, probability: number): void {
    assertValidQubitIndex(this.nQubits, qubit);
    if (probability <= 0) return;

    const [e0, e1] = amplitudeDampingOperators(probability);
    this.densityMatrix = applyKrausChannelToDensityMatrix(this.densityMatrix, [
      embedSingleQubitOperator(this.nQubits, qubit, e0),
      embedSingleQubitOperator(this.nQubits, qubit, e1),
    ]);
  }

  expZ(qubit: number): number {
    return observableTrace(this.densityMatrix, embedSingleQubitOperator(this.nQubits, qubit, PAULI_Z));
  }

  expZZ(q1: number, q2: number): number {
    return observableTrace(
      this.densityMatrix,
      embedTwoQubitOperator(this.nQubits, q1, q2, kron(PAULI_Z, PAULI_Z)),
    );
  }

  expXX(q1: number, q2: number): number {
    return observableTrace(
      this.densityMatrix,
      embedTwoQubitOperator(this.nQubits, q1, q2, kron(PAULI_X, PAULI_X)),
    );
  }

  measurementProbabilities(): number[] {
    return Array.from({ length: this.dim }, (_, index) => this.densityMatrix[index]![index]!.re);
  }

  basisStatePopulation(index: number): number {
    return this.densityMatrix[index]![index]!.re;
  }
}

export const probabilitiesToBitstrings = (probabilities: number[], nQubits: number, shots: number): string[] => {
  const cumulativeProbabilities: number[] = [];
  let total = 0;

  for (const probability of probabilities) {
    total += probability;
    cumulativeProbabilities.push(total);
  }

  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`Density matrix populations do not sum to 1 within tolerance; got ${total}.`);
  }

  return Array.from({ length: shots }, () => {
    const sample = Math.random();
    const sampledIndex = cumulativeProbabilities.findIndex((value) => sample <= value);
    const index = sampledIndex === -1 ? probabilities.length - 1 : sampledIndex;
    return index.toString(2).padStart(nQubits, "0");
  });
};

export const maxPopulationDifference = (left: DensityMatrixSimulator, right: DensityMatrixSimulator): number => {
  if (left.dim !== right.dim) {
    throw new Error("Population-difference comparison requires matching dimensions.");
  }

  let difference = 0;
  for (let index = 0; index < left.dim; index += 1) {
    difference = Math.max(difference, Math.abs(left.basisStatePopulation(index) - right.basisStatePopulation(index)));
  }
  return difference;
};
