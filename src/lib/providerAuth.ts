import type { BackendPreferences } from "./backendPreferences";
import { getBackendTargetDescriptor, type BackendTargetId } from "./backendTargets";

export type ProviderSessionCredentials = {
  ionqApiKey: string;
};

export type ResolvedProviderAuth =
  | {
      provider: "local";
      mode: "not-required";
    }
  | {
      provider: "ionq";
      mode: "browser-session";
      apiKey: string;
    }
  | {
      provider: "ionq";
      mode: "server-managed";
    };

const PROVIDER_SESSION_CREDENTIALS_STORAGE_KEY = "vqa-sim:provider-session-credentials";

export const DEFAULT_PROVIDER_SESSION_CREDENTIALS: ProviderSessionCredentials = {
  ionqApiKey: "",
};

export const loadProviderSessionCredentials = (): ProviderSessionCredentials => {
  if (typeof window === "undefined") return DEFAULT_PROVIDER_SESSION_CREDENTIALS;

  try {
    const raw = window.sessionStorage.getItem(PROVIDER_SESSION_CREDENTIALS_STORAGE_KEY);
    if (!raw) return DEFAULT_PROVIDER_SESSION_CREDENTIALS;

    const parsed = JSON.parse(raw) as Partial<ProviderSessionCredentials>;
    return {
      ionqApiKey:
        typeof parsed.ionqApiKey === "string" ? parsed.ionqApiKey : DEFAULT_PROVIDER_SESSION_CREDENTIALS.ionqApiKey,
    };
  } catch {
    return DEFAULT_PROVIDER_SESSION_CREDENTIALS;
  }
};

export const saveProviderSessionCredentials = (credentials: ProviderSessionCredentials): void => {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(PROVIDER_SESSION_CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
};

export const clearProviderSessionCredentials = (): void => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PROVIDER_SESSION_CREDENTIALS_STORAGE_KEY);
};

export const resolveProviderAuthForTarget = (
  targetId: BackendTargetId,
  preferences: BackendPreferences,
  credentials: ProviderSessionCredentials,
): ResolvedProviderAuth => {
  const descriptor = getBackendTargetDescriptor(targetId);

  if (descriptor.provider === "local") {
    return {
      provider: "local",
      mode: "not-required",
    };
  }

  if (preferences.ionqCredentialMode === "server-managed") {
    return {
      provider: "ionq",
      mode: "server-managed",
    };
  }

  return {
    provider: "ionq",
    mode: "browser-session",
    apiKey: credentials.ionqApiKey.trim(),
  };
};

export const getProviderAuthConfigurationStatus = (
  auth: ResolvedProviderAuth,
): { configured: boolean; detail: string } => {
  if (auth.provider === "local") {
    return {
      configured: true,
      detail: "Local execution does not require provider credentials.",
    };
  }

  if (auth.mode === "server-managed") {
    return {
      configured: true,
      detail: "Browser secrets are disabled. Provider auth must be supplied by a server-side proxy.",
    };
  }

  if (auth.apiKey) {
    return {
      configured: true,
      detail: "IonQ API key is available for this browser tab only.",
    };
  }

  return {
    configured: false,
    detail: "IonQ browser-session mode requires an API key for this tab before remote execution can start.",
  };
};
