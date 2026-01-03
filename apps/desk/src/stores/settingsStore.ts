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
  minimizeToTray: boolean;
  closeToTray: boolean;
  setApiMode: (mode: ApiMode) => void;
  setApiBaseUrl: (url: string) => void;
  setMockDelayMs: (ms: number) => void;
  setMockFailureRate: (rate: number) => void;
  setTerrainQuality: (quality: TerrainQuality) => void;
  setReducedMotion: (enabled: boolean) => void;
  setTrayEnabled: (enabled: boolean) => void;
  setMinimizeToTray: (enabled: boolean) => void;
  setCloseToTray: (enabled: boolean) => void;
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
  | "minimizeToTray"
  | "closeToTray"
> = {
  apiMode: "mock",
  apiBaseUrl: "http://127.0.0.1:3000",
  mockDelayMs: 200,
  mockFailureRate: 0,
  terrainQuality: "auto",
  reducedMotion: false,
  trayEnabled: true,
  minimizeToTray: true,
  closeToTray: true
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
      setMinimizeToTray: (minimizeToTray) => {
        set({ minimizeToTray });
      },
      setCloseToTray: (closeToTray) => {
        set({ closeToTray });
      },
      reset: () => {
        set({ ...defaults });
      }
    }),
    { name: "desk_settings_v1" }
  )
);
