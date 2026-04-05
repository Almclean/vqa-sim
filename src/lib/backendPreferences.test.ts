import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BACKEND_PREFERENCES,
  loadBackendPreferences,
  saveBackendPreferences,
  type BackendPreferences,
} from "./backendPreferences";

describe("backendPreferences", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("falls back to safe defaults when no preferences are stored", () => {
    expect(loadBackendPreferences()).toEqual(DEFAULT_BACKEND_PREFERENCES);
  });

  it("ignores legacy local-storage api key fields and keeps only non-secret preferences", () => {
    window.localStorage.setItem(
      "vqa-sim:backend-preferences",
      JSON.stringify({
        executionTarget: "ionq-simulator",
        ionqApiKey: "legacy-should-not-be-read",
      }),
    );

    expect(loadBackendPreferences()).toEqual({
      executionTarget: "ionq-simulator",
      ionqCredentialMode: "browser-session",
      noiseProfileId: "ideal",
      depolarizingProbability: 0.05,
      amplitudeDampingProbability: 0.02,
      readoutErrorProbability: 0.01,
    });
  });

  it("migrates legacy depolarizing preferences into the custom noise profile", () => {
    window.localStorage.setItem(
      "vqa-sim:backend-preferences",
      JSON.stringify({
        executionTarget: "density-cpu",
        ionqCredentialMode: "browser-session",
        noiseModelKind: "depolarizing",
        depolarizingProbability: 0.12,
      }),
    );

    expect(loadBackendPreferences()).toEqual({
      executionTarget: "density-cpu",
      ionqCredentialMode: "browser-session",
      noiseProfileId: "custom",
      depolarizingProbability: 0.12,
      amplitudeDampingProbability: 0.02,
      readoutErrorProbability: 0.01,
    });
  });

  it("persists backend preferences without writing provider secrets", () => {
    const preferences: BackendPreferences = {
      executionTarget: "ionq-qpu",
      ionqCredentialMode: "server-managed",
      noiseProfileId: "custom",
      depolarizingProbability: 0.12,
      amplitudeDampingProbability: 0.04,
      readoutErrorProbability: 0.03,
    };

    saveBackendPreferences(preferences);

    expect(window.localStorage.getItem("vqa-sim:backend-preferences")).toBe(
      JSON.stringify({
        executionTarget: "ionq-qpu",
        ionqCredentialMode: "server-managed",
        noiseProfileId: "custom",
        depolarizingProbability: 0.12,
        amplitudeDampingProbability: 0.04,
        readoutErrorProbability: 0.03,
      }),
    );
  });
});
