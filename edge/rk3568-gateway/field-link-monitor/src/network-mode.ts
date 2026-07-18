export type NetworkModeLevel = "healthy" | "attention" | "critical";

export type NetworkModeAssessment = {
  level: NetworkModeLevel;
  summary: string;
};

const HEALTHY_NETWORK_MODES = new Set(["sta_connected", "ethernet_uplink"]);

export function assessNetworkMode(runtimeMode: string | null): NetworkModeAssessment {
  if (runtimeMode && HEALTHY_NETWORK_MODES.has(runtimeMode)) {
    return {
      level: "healthy",
      summary: `rk3568 network bootstrap is in ${runtimeMode}`
    };
  }

  if (runtimeMode === "ap_fallback") {
    return {
      level: "attention",
      summary: "rk3568 network bootstrap has fallen back to AP mode"
    };
  }

  return {
    level: "critical",
    summary: "rk3568 network bootstrap is not in a steady-state mode"
  };
}
