import { useEffect, useRef } from "react";
import clsx from "clsx";
import type { RiskLevel } from "../data/mockData";
import {
  createMobileSpaceScene,
  type MobileSpaceSceneMode
} from "../lib/createMobileSpaceScene";

type SceneHotspot = {
  id: string;
  level: RiskLevel;
};

type MobileSpaceSceneProps = {
  className?: string;
  hotspots: readonly SceneHotspot[];
  mode: MobileSpaceSceneMode;
  playback: number;
  focusHotspotId: string;
  interactive?: boolean;
  resetSignal?: number;
  onFocusHotspotIdChange?: (hotspotId: string) => void;
};

export function MobileSpaceScene({
  className,
  hotspots,
  mode,
  playback,
  focusHotspotId,
  interactive = true,
  resetSignal = 0,
  onFocusHotspotIdChange
}: MobileSpaceSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ReturnType<typeof createMobileSpaceScene> | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const controller = createMobileSpaceScene(container, {
      hotspots,
      interactive,
      initialMode: mode,
      initialPlayback: playback,
      initialFocusHotspotId: focusHotspotId,
      ...(onFocusHotspotIdChange ? { onFocusChange: onFocusHotspotIdChange } : {})
    });

    controllerRef.current = controller;

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [hotspots, interactive, onFocusHotspotIdChange]);

  useEffect(() => {
    controllerRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    controllerRef.current?.setPlayback(playback);
  }, [playback]);

  useEffect(() => {
    controllerRef.current?.setFocus(focusHotspotId);
  }, [focusHotspotId]);

  useEffect(() => {
    if (resetSignal > 0) {
      controllerRef.current?.recenter();
    }
  }, [resetSignal]);

  return (
    <div
      ref={containerRef}
      className={clsx("space-scene-canvas", className)}
      aria-label="南麓一号坡体 WebGL 三维风险模型"
      role="img"
    />
  );
}
