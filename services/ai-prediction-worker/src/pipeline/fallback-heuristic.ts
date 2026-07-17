import type { FeatureVector, RegionContext } from "./types";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export type HeuristicResult = {
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  explain: string;
  warningFactors: string[];
};

export function toRiskLevel(score: number): "low" | "medium" | "high" {
  if (score >= 0.8) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

export function runFallbackHeuristic(
  features: FeatureVector,
  regionContext: RegionContext
): HeuristicResult {
  const displacement = features.values.displacement_abs_mm ?? 0;
  const displacementDelta24h = Math.abs(features.values.displacementSurfaceMm_delta_24h ?? 0);
  const tilt = features.values.tilt_abs_deg ?? 0;
  const vibration = features.values.vibration_abs_g ?? 0;
  const rainfall24h = features.values.rainfallCurrentMm_sum_24h ?? features.values.rainfallCurrentMm ?? 0;

  const dispScore = clamp01(displacement / 100);
  const dispDeltaScore = clamp01(displacementDelta24h / 50);
  const tiltScore = clamp01(tilt / 10);
  const vibrationScore = clamp01(vibration / 5);
  const rainfallScore = clamp01(rainfall24h / 100);

  const riskScore = clamp01(
    dispScore * 0.4 +
      dispDeltaScore * 0.25 +
      rainfallScore * 0.15 +
      tiltScore * 0.15 +
      vibrationScore * 0.05
  );
  const riskLevel = toRiskLevel(riskScore);
  const explain =
    `heuristic fallback: disp=${String(displacement)}, dispDelta24h=${String(displacementDelta24h)}, ` +
    `rain24h=${String(rainfall24h)}, tilt=${String(tilt)}, vib=${String(vibration)}, ` +
    `region=${regionContext.regionCode ?? "n/a"}`;
  const warningFactors = [
    `displacement_abs_mm=${String(displacement)}`,
    `displacementSurfaceMm_delta_24h=${String(displacementDelta24h)}`,
    `rainfallCurrentMm_sum_24h=${String(rainfall24h)}`,
    `tilt_abs_deg=${String(tilt)}`,
    `vibration_abs_g=${String(vibration)}`
  ];

  return { riskScore, riskLevel, explain, warningFactors };
}
