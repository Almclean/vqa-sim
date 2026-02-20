type Complex = { re: number; im: number };

const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cScale = (a: Complex, x: number): Complex => ({ re: a.re * x, im: a.im * x });
const cProb = (a: Complex): number => a.re * a.re + a.im * a.im;

export class QuantumSimulator {
  readonly nQubits: number;
  readonly dim: number;
  state: Complex[];

  constructor(nQubits: number) {
    this.nQubits = nQubits;
    this.dim = 1 << nQubits;
    this.state = Array.from({ length: this.dim }, (_, i) => (i === 0 ? { re: 1, im: 0 } : { re: 0, im: 0 }));
  }

  clone(): QuantumSimulator {
    const next = new QuantumSimulator(this.nQubits);
    next.state = this.state.map((amp) => ({ re: amp.re, im: amp.im }));
    return next;
  }

  private applySingleQubit(
    qubit: number,
    m00: Complex,
    m01: Complex,
    m10: Complex,
    m11: Complex,
  ): void {
    const bit = 1 << qubit;
    for (let i = 0; i < this.dim; i += 1) {
      if ((i & bit) !== 0) continue;
      const j = i | bit;
      const a0 = this.state[i];
      const a1 = this.state[j];
      this.state[i] = cAdd(cMul(m00, a0), cMul(m01, a1));
      this.state[j] = cAdd(cMul(m10, a0), cMul(m11, a1));
    }
  }

  applyRx(qubit: number, theta: number): void {
    const c = Math.cos(theta / 2);
    const s = Math.sin(theta / 2);
    this.applySingleQubit(qubit, { re: c, im: 0 }, { re: 0, im: -s }, { re: 0, im: -s }, { re: c, im: 0 });
  }

  applyRy(qubit: number, theta: number): void {
    const c = Math.cos(theta / 2);
    const s = Math.sin(theta / 2);
    this.applySingleQubit(qubit, { re: c, im: 0 }, { re: -s, im: 0 }, { re: s, im: 0 }, { re: c, im: 0 });
  }

  applyXX(q1: number, q2: number, theta: number): void {
    if (q1 === q2) return;
    const qa = Math.min(q1, q2);
    const qb = Math.max(q1, q2);
    const bitA = 1 << qa;
    const bitB = 1 << qb;
    const c = Math.cos(theta / 2);
    const minusIS: Complex = { re: 0, im: -Math.sin(theta / 2) };

    for (let i = 0; i < this.dim; i += 1) {
      if ((i & bitA) !== 0 || (i & bitB) !== 0) continue;

      const i00 = i;
      const i01 = i | bitB;
      const i10 = i | bitA;
      const i11 = i | bitA | bitB;

      const a00 = this.state[i00];
      const a01 = this.state[i01];
      const a10 = this.state[i10];
      const a11 = this.state[i11];

      const n00 = cAdd(cScale(a00, c), cMul(minusIS, a11));
      const n11 = cAdd(cMul(minusIS, a00), cScale(a11, c));
      const n01 = cAdd(cScale(a01, c), cMul(minusIS, a10));
      const n10 = cAdd(cMul(minusIS, a01), cScale(a10, c));

      this.state[i00] = n00;
      this.state[i01] = n01;
      this.state[i10] = n10;
      this.state[i11] = n11;
    }
  }

  expZ(qubit: number): number {
    const bit = 1 << qubit;
    let exp = 0;
    for (let i = 0; i < this.dim; i += 1) {
      const sign = (i & bit) === 0 ? 1 : -1;
      exp += sign * cProb(this.state[i]);
    }
    return exp;
  }

  expZZ(q1: number, q2: number): number {
    const bit1 = 1 << q1;
    const bit2 = 1 << q2;
    let exp = 0;
    for (let i = 0; i < this.dim; i += 1) {
      const b1 = (i & bit1) === 0 ? 0 : 1;
      const b2 = (i & bit2) === 0 ? 0 : 1;
      const sign = b1 === b2 ? 1 : -1;
      exp += sign * cProb(this.state[i]);
    }
    return exp;
  }

  expXX(q1: number, q2: number): number {
    const rotated = this.clone();
    rotated.applyRy(q1, -Math.PI / 2);
    rotated.applyRy(q2, -Math.PI / 2);
    return rotated.expZZ(q1, q2);
  }
}
