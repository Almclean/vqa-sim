import { getBackendTargetDescriptor, type BackendTargetId } from "./backendTargets";

export type BackendPreferences = {
  executionTarget: BackendTargetId;
  ionqApiKey: string;
};

const BACKEND_PREFERENCES_STORAGE_KEY = "vqa-sim:backend-preferences";

export const DEFAULT_BACKEND_PREFERENCES: BackendPreferences = {
  executionTarget: "dense-cpu",
  ionqApiKey: "",
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
      ionqApiKey: typeof parsed.ionqApiKey === "string" ? parsed.ionqApiKey : DEFAULT_BACKEND_PREFERENCES.ionqApiKey,
    };
  } catch {
    return DEFAULT_BACKEND_PREFERENCES;
  }
};

export const saveBackendPreferences = (preferences: BackendPreferences): void => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(BACKEND_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
};
