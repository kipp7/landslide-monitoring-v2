import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ApiMode } from "../api/client";

export type TerrainQuality = "auto" | "high" | "medium" | "low";

type SettingsState = {
  apiMode: ApiMode;
  apiBaseUrl: string;
  mockDelayMs: number;
  terrainQuality: TerrainQuality;
  trayEnabled: boolean;
  setApiMode: (mode: ApiMode) => void;
  setApiBaseUrl: (url: string) => void;
  setMockDelayMs: (ms: number) => void;
  setTerrainQuality: (quality: TerrainQuality) => void;
  setTrayEnabled: (enabled: boolean) => void;
  reset: () => void;
};

const defaults: Pick<
  SettingsState,
  "apiMode" | "apiBaseUrl" | "mockDelayMs" | "terrainQuality" | "trayEnabled"
> = {
  apiMode: "mock",
  apiBaseUrl: "http://127.0.0.1:3000",
  mockDelayMs: 200,
  terrainQuality: "auto",
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
      setTerrainQuality: (terrainQuality) => {
        set({ terrainQuality });
      },
      setTrayEnabled: (trayEnabled) => {
        set({ trayEnabled });
      },
      reset: () => {
        set({ ...defaults });
      }
    }),
    { name: "desk_settings_v1" }
  )
);
