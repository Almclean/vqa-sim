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
    });
  });

  it("persists backend preferences without writing provider secrets", () => {
    const preferences: BackendPreferences = {
      executionTarget: "ionq-qpu",
      ionqCredentialMode: "server-managed",
    };

    saveBackendPreferences(preferences);

    expect(window.localStorage.getItem("vqa-sim:backend-preferences")).toBe(
      JSON.stringify({
        executionTarget: "ionq-qpu",
        ionqCredentialMode: "server-managed",
      }),
    );
  });
});
