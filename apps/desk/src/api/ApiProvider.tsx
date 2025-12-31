import React, { createContext, useContext, useMemo } from "react";

import type { ApiClient, ApiMode } from "./client";
import { createHttpClient } from "./httpClient";
import { createMockClient } from "./mockClient";

export type ApiProviderConfig = {
  mode: ApiMode;
  baseUrl: string;
  token: string | null;
  mockDelayMs?: number;
  mockFailureRate?: number;
};

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider(props: React.PropsWithChildren<{ config: ApiProviderConfig }>) {
  const { mode, baseUrl, token, mockDelayMs, mockFailureRate } = props.config;
  const delayMs = mockDelayMs ?? 200;
  const failureRate = mockFailureRate ?? 0;

  const mockClient = useMemo<ApiClient>(
    () => createMockClient({ delayMs, failureRate }),
    [delayMs, failureRate]
  );
  const httpClient = useMemo<ApiClient>(
    () => createHttpClient({ baseUrl, getToken: () => token }),
    [baseUrl, token]
  );

  const client = mode === "http" ? httpClient : mockClient;

  return <ApiContext.Provider value={client}>{props.children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error("useApi must be used within ApiProvider");
  return client;
}
