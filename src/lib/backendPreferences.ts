import { getBackendTargetDescriptor, type BackendTargetId } from "./backendTargets";
import {
  DEFAULT_CUSTOM_NOISE_SETTINGS,
  isValidNoiseProfileId,
  normalizeNoiseSettings,
  type NoiseProfileId,
} from "./noiseProfiles";

export type IonQCredentialMode = "browser-session" | "server-managed";

export type BackendPreferences = {
  executionTarget: BackendTargetId;
  ionqCredentialMode: IonQCredentialMode;
  noiseProfileId: NoiseProfileId;
  depolarizingProbability: number;
  amplitudeDampingProbability: number;
  readoutErrorProbability: number;
};

const BACKEND_PREFERENCES_STORAGE_KEY = "vqa-sim:backend-preferences";

export const DEFAULT_BACKEND_PREFERENCES: BackendPreferences = {
  executionTarget: "dense-cpu",
  ionqCredentialMode: "browser-session",
  noiseProfileId: "ideal",
  depolarizingProbability: DEFAULT_CUSTOM_NOISE_SETTINGS.depolarizingProbability,
  amplitudeDampingProbability: DEFAULT_CUSTOM_NOISE_SETTINGS.amplitudeDampingProbability,
  readoutErrorProbability: DEFAULT_CUSTOM_NOISE_SETTINGS.readoutErrorProbability,
};

const isValidBackendTargetId = (value: unknown): value is BackendTargetId => {
  if (typeof value !== "string") return false;

  try {
    getBackendTargetDescriptor(value as BackendTargetId);
    return true;
  } catch {
    return false;
  }
};

const isValidIonQCredentialMode = (value: unknown): value is IonQCredentialMode =>
  value === "browser-session" || value === "server-managed";

export const loadBackendPreferences = (): BackendPreferences => {
  if (typeof window === "undefined") return DEFAULT_BACKEND_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(BACKEND_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_BACKEND_PREFERENCES;

    const parsed = JSON.parse(raw) as Partial<BackendPreferences>;
    const legacyNoiseModelKind = (parsed as { noiseModelKind?: unknown }).noiseModelKind;
    const noiseProfileId = isValidNoiseProfileId(parsed.noiseProfileId)
      ? parsed.noiseProfileId
      : legacyNoiseModelKind === "depolarizing"
        ? "custom"
        : DEFAULT_BACKEND_PREFERENCES.noiseProfileId;
    const customNoiseSettings = normalizeNoiseSettings(
      {
        depolarizingProbability: parsed.depolarizingProbability,
        amplitudeDampingProbability: parsed.amplitudeDampingProbability,
        readoutErrorProbability: parsed.readoutErrorProbability,
      },
      DEFAULT_CUSTOM_NOISE_SETTINGS,
    );

    return {
      executionTarget: isValidBackendTargetId(parsed.executionTarget)
        ? parsed.executionTarget
        : DEFAULT_BACKEND_PREFERENCES.executionTarget,
      ionqCredentialMode: isValidIonQCredentialMode(parsed.ionqCredentialMode)
        ? parsed.ionqCredentialMode
        : DEFAULT_BACKEND_PREFERENCES.ionqCredentialMode,
      noiseProfileId,
      depolarizingProbability: customNoiseSettings.depolarizingProbability,
      amplitudeDampingProbability: customNoiseSettings.amplitudeDampingProbability,
      readoutErrorProbability: customNoiseSettings.readoutErrorProbability,
    };
  } catch {
    return DEFAULT_BACKEND_PREFERENCES;
  }
};

export const saveBackendPreferences = (preferences: BackendPreferences): void => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(BACKEND_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
};
