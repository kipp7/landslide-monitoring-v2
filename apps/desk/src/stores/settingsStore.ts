import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ApiMode } from "../api/client";

export type TerrainQuality = "auto" | "high" | "medium" | "low";

type SettingsState = {
  apiMode: ApiMode;
  apiBaseUrl: string;
  mockDelayMs: number;
  mockFailureRate: number;
  terrainQuality: TerrainQuality;
  reducedMotion: boolean;
  trayEnabled: boolean;
  setApiMode: (mode: ApiMode) => void;
  setApiBaseUrl: (url: string) => void;
  setMockDelayMs: (ms: number) => void;
  setMockFailureRate: (rate: number) => void;
  setTerrainQuality: (quality: TerrainQuality) => void;
  setReducedMotion: (enabled: boolean) => void;
  setTrayEnabled: (enabled: boolean) => void;
  reset: () => void;
};

const defaults: Pick<
  SettingsState,
  | "apiMode"
  | "apiBaseUrl"
  | "mockDelayMs"
  | "mockFailureRate"
  | "terrainQuality"
  | "reducedMotion"
  | "trayEnabled"
> = {
  apiMode: "http",
  apiBaseUrl: "http://127.0.0.1:8081",
  mockDelayMs: 200,
  mockFailureRate: 0,
  terrainQuality: "auto",
  reducedMotion: false,
  trayEnabled: true
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
      setMockFailureRate: (mockFailureRate) => {
        set({ mockFailureRate });
      },
      setTerrainQuality: (terrainQuality) => {
        set({ terrainQuality });
      },
      setReducedMotion: (reducedMotion) => {
        set({ reducedMotion });
      },
      setTrayEnabled: (trayEnabled) => {
        set({ trayEnabled });
      },
      reset: () => {
        set({ ...defaults });
      }
    }),
    {
      name: "desk_settings_v1",
      version: 2,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<SettingsState>;
        if (version < 2) {
          const looksLikeOldLocalDefault =
            state.apiMode === "mock" &&
            (state.apiBaseUrl === "http://127.0.0.1:3000" || state.apiBaseUrl === "http://localhost:3000");

          if (looksLikeOldLocalDefault) {
            return {
              ...state,
              apiMode: "http",
              apiBaseUrl: "http://127.0.0.1:8081"
            } as SettingsState;
          }
        }
        return { ...defaults, ...state } as SettingsState;
      }
    }
  )
);
