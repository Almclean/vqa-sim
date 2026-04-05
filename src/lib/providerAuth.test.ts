import { afterEach, describe, expect, it } from "vitest";
import type { BackendPreferences } from "./backendPreferences";
import {
  DEFAULT_PROVIDER_SESSION_CREDENTIALS,
  getProviderAuthConfigurationStatus,
  loadProviderSessionCredentials,
  resolveProviderAuthForTarget,
  saveProviderSessionCredentials,
} from "./providerAuth";

const makePreferences = (overrides?: Partial<BackendPreferences>): BackendPreferences => ({
  executionTarget: "dense-cpu",
  ionqCredentialMode: "browser-session",
  noiseProfileId: "ideal",
  depolarizingProbability: 0.05,
  amplitudeDampingProbability: 0.02,
  readoutErrorProbability: 0.01,
  ...overrides,
});

describe("providerAuth", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("loads empty provider session credentials by default", () => {
    expect(loadProviderSessionCredentials()).toEqual(DEFAULT_PROVIDER_SESSION_CREDENTIALS);
  });

  it("stores provider secrets in session storage instead of local storage", () => {
    saveProviderSessionCredentials({
      ionqApiKey: "session-only-key",
    });

    expect(loadProviderSessionCredentials()).toEqual({
      ionqApiKey: "session-only-key",
    });
    expect(window.localStorage.getItem("vqa-sim:provider-session-credentials")).toBeNull();
    expect(window.sessionStorage.getItem("vqa-sim:provider-session-credentials")).toContain("session-only-key");
  });

  it("resolves local targets as not requiring provider auth", () => {
    expect(
      resolveProviderAuthForTarget("dense-cpu", makePreferences(), {
        ionqApiKey: "unused",
      }),
    ).toEqual({
      provider: "local",
      mode: "not-required",
    });
  });

  it("resolves IonQ browser-session auth with a trimmed session key", () => {
    expect(
      resolveProviderAuthForTarget(
        "ionq-simulator",
        makePreferences({
          executionTarget: "ionq-simulator",
          ionqCredentialMode: "browser-session",
        }),
        {
          ionqApiKey: "  tab-key  ",
        },
      ),
    ).toEqual({
      provider: "ionq",
      mode: "browser-session",
      apiKey: "tab-key",
    });
  });

  it("resolves IonQ server-managed auth without exposing a browser secret", () => {
    expect(
      resolveProviderAuthForTarget(
        "ionq-qpu",
        makePreferences({
          executionTarget: "ionq-qpu",
          ionqCredentialMode: "server-managed",
        }),
        {
          ionqApiKey: "should-not-be-used",
        },
      ),
    ).toEqual({
      provider: "ionq",
      mode: "server-managed",
    });
  });

  it("marks missing browser-session IonQ auth as unconfigured", () => {
    const status = getProviderAuthConfigurationStatus({
      provider: "ionq",
      mode: "browser-session",
      apiKey: "",
    });

    expect(status.configured).toBe(false);
    expect(status.detail).toMatch(/requires an api key/i);
  });
});
