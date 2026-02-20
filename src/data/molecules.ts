export type MoleculeSpec = {
  label: string;
  coeffs: {
    g0: number;
    g1: number;
    g2: number;
    g3: number;
    g4: number;
  };
  theoreticalMin: number;
  atoms: { symbol: string; x: number }[];
};

export const MOLECULES = {
  "H2_0.74": {
    label: "H2 (Equilibrium 0.74 A)",
    coeffs: {
      g0: -1.0523732,
      g1: 0.3979374,
      g2: -0.3979374,
      g3: -0.0112801,
      g4: 0.1809312,
    },
    theoreticalMin: -1.13727,
    atoms: [
      { symbol: "H", x: 28 },
      { symbol: "H", x: 72 },
    ],
  },
  "H2_1.5": {
    label: "H2 (Stretched 1.5 A)",
    coeffs: {
      g0: -0.8604,
      g1: 0.355,
      g2: -0.355,
      g3: -0.032,
      g4: 0.14,
    },
    theoreticalMin: -0.998,
    atoms: [
      { symbol: "H", x: 22 },
      { symbol: "H", x: 78 },
    ],
  },
  HeH: {
    label: "HeH (Helium Hydride)",
    coeffs: {
      g0: -2.845,
      g1: 0.47,
      g2: -0.13,
      g3: -0.07,
      g4: 0.22,
    },
    theoreticalMin: -2.99,
    atoms: [
      { symbol: "He", x: 30 },
      { symbol: "H", x: 70 },
    ],
  },
} satisfies Record<string, MoleculeSpec>;

export type MoleculeKey = keyof typeof MOLECULES;
