export type NoiseProfileId = "ideal" | "superconducting-like" | "trapped-ion-like" | "custom";

export type NoiseSettings = {
  depolarizingProbability: number;
  amplitudeDampingProbability: number;
  readoutErrorProbability: number;
};

export type NoiseProfileDescriptor = {
  id: NoiseProfileId;
  label: string;
  settings: NoiseSettings;
};

export const DEFAULT_CUSTOM_NOISE_SETTINGS: NoiseSettings = {
  depolarizingProbability: 0.05,
  amplitudeDampingProbability: 0.02,
  readoutErrorProbability: 0.01,
};

const IDEAL_NOISE_SETTINGS: NoiseSettings = {
  depolarizingProbability: 0,
  amplitudeDampingProbability: 0,
  readoutErrorProbability: 0,
};

const NOISE_PROFILE_DESCRIPTORS: Record<Exclude<NoiseProfileId, "custom">, NoiseProfileDescriptor> = {
  ideal: {
    id: "ideal",
    label: "Ideal simulator",
    settings: IDEAL_NOISE_SETTINGS,
  },
  "superconducting-like": {
    id: "superconducting-like",
    label: "Superconducting-like",
    settings: {
      depolarizingProbability: 0.03,
      amplitudeDampingProbability: 0.08,
      readoutErrorProbability: 0.04,
    },
  },
  "trapped-ion-like": {
    id: "trapped-ion-like",
    label: "Trapped-ion-like",
    settings: {
      depolarizingProbability: 0.008,
      amplitudeDampingProbability: 0.015,
      readoutErrorProbability: 0.012,
    },
  },
};

const clampProbability = (value: unknown, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
};

export const isValidNoiseProfileId = (value: unknown): value is NoiseProfileId =>
  value === "ideal" || value === "superconducting-like" || value === "trapped-ion-like" || value === "custom";

export const normalizeNoiseSettings = (
  settings: Partial<NoiseSettings> | undefined,
  fallback: NoiseSettings = DEFAULT_CUSTOM_NOISE_SETTINGS,
): NoiseSettings => ({
  depolarizingProbability: clampProbability(settings?.depolarizingProbability, fallback.depolarizingProbability),
  amplitudeDampingProbability: clampProbability(
    settings?.amplitudeDampingProbability,
    fallback.amplitudeDampingProbability,
  ),
  readoutErrorProbability: clampProbability(settings?.readoutErrorProbability, fallback.readoutErrorProbability),
});

export const listNoiseProfiles = (): NoiseProfileDescriptor[] => [
  NOISE_PROFILE_DESCRIPTORS.ideal,
  NOISE_PROFILE_DESCRIPTORS["superconducting-like"],
  NOISE_PROFILE_DESCRIPTORS["trapped-ion-like"],
  {
    id: "custom",
    label: "Custom",
    settings: DEFAULT_CUSTOM_NOISE_SETTINGS,
  },
];

export const getNoiseProfileDescriptor = (profileId: NoiseProfileId): NoiseProfileDescriptor =>
  profileId === "custom"
    ? {
        id: "custom",
        label: "Custom",
        settings: DEFAULT_CUSTOM_NOISE_SETTINGS,
      }
    : NOISE_PROFILE_DESCRIPTORS[profileId];

export const resolveNoiseSettingsForProfile = (
  profileId: NoiseProfileId,
  customSettings: NoiseSettings,
): NoiseSettings => (profileId === "custom" ? customSettings : getNoiseProfileDescriptor(profileId).settings);
