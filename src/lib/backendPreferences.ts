import { getBackendTargetDescriptor, type BackendTargetId } from "./backendTargets";

export type IonQCredentialMode = "browser-session" | "server-managed";
export type NoiseModelKind = "ideal" | "depolarizing";

export type BackendPreferences = {
  executionTarget: BackendTargetId;
  ionqCredentialMode: IonQCredentialMode;
  noiseModelKind: NoiseModelKind;
  depolarizingProbability: number;
};

const BACKEND_PREFERENCES_STORAGE_KEY = "vqa-sim:backend-preferences";

export const DEFAULT_BACKEND_PREFERENCES: BackendPreferences = {
  executionTarget: "dense-cpu",
  ionqCredentialMode: "browser-session",
  noiseModelKind: "ideal",
  depolarizingProbability: 0.05,
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

const isValidNoiseModelKind = (value: unknown): value is NoiseModelKind =>
  value === "ideal" || value === "depolarizing";

const normalizeDepolarizingProbability = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_BACKEND_PREFERENCES.depolarizingProbability;
  }

  return Math.min(1, Math.max(0, value));
};

export const loadBackendPreferences = (): BackendPreferences => {
  if (typeof window === "undefined") return DEFAULT_BACKEND_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(BACKEND_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_BACKEND_PREFERENCES;

    const parsed = JSON.parse(raw) as Partial<BackendPreferences>;
    return {
      executionTarget: isValidBackendTargetId(parsed.executionTarget)
        ? parsed.executionTarget
        : DEFAULT_BACKEND_PREFERENCES.executionTarget,
      ionqCredentialMode: isValidIonQCredentialMode(parsed.ionqCredentialMode)
        ? parsed.ionqCredentialMode
        : DEFAULT_BACKEND_PREFERENCES.ionqCredentialMode,
      noiseModelKind: isValidNoiseModelKind(parsed.noiseModelKind)
        ? parsed.noiseModelKind
        : DEFAULT_BACKEND_PREFERENCES.noiseModelKind,
      depolarizingProbability: normalizeDepolarizingProbability(parsed.depolarizingProbability),
    };
  } catch {
    return DEFAULT_BACKEND_PREFERENCES;
  }
};

export const saveBackendPreferences = (preferences: BackendPreferences): void => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(BACKEND_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
};
