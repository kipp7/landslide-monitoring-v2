import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ApiMode } from "../api/client";

type SettingsState = {
  apiMode: ApiMode;
  apiBaseUrl: string;
  mockDelayMs: number;
  setApiMode: (mode: ApiMode) => void;
  setApiBaseUrl: (url: string) => void;
  setMockDelayMs: (ms: number) => void;
  reset: () => void;
};

const defaults: Pick<SettingsState, "apiMode" | "apiBaseUrl" | "mockDelayMs"> = {
  apiMode: "mock",
  apiBaseUrl: "http://127.0.0.1:3000",
  mockDelayMs: 200
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      setApiMode: (apiMode) => {
        set({ apiMode });
      },
      setApiBaseUrl: (apiBaseUrl) => {
        set({ apiBaseUrl });
      },
      setMockDelayMs: (mockDelayMs) => {
        set({ mockDelayMs });
      },
      reset: () => {
        set({ ...defaults });
      }
    }),
    { name: "desk_settings_v1" }
  )
);
