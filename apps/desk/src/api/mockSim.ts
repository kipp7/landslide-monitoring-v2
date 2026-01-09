export type DemoScenario = "normal" | "rainstorm" | "landslide_warning" | "comms_outage";

export type MockSimConfig = {
  seed: string;
  speed: number;
  scenario: DemoScenario;
};

type SimClock = {
  real0: number;
  sim0: number;
  speed: number;
};

const CONFIG_KEY = "desk.mock.sim.config.v1";
const CLOCK_KEY = "desk.mock.sim.clock.v1";

function clampNumber(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadMockSimConfig(): MockSimConfig {
  const raw = localStorage.getItem(CONFIG_KEY);
  const parsed = raw ? safeJsonParse<Partial<MockSimConfig>>(raw) : null;
  const seed = typeof parsed?.seed === "string" && parsed.seed ? parsed.seed : "YLNU-DEMO";
  const speedRaw = typeof parsed?.speed === "number" ? parsed.speed : 30;
  const speed = clampNumber(Math.round(speedRaw), 1, 720);
  const scenario =
    parsed?.scenario === "normal" || parsed?.scenario === "rainstorm" || parsed?.scenario === "landslide_warning" || parsed?.scenario === "comms_outage"
      ? parsed.scenario
      : "normal";
  return { seed, speed, scenario };
}

export function saveMockSimConfig(next: MockSimConfig) {
  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({
      seed: next.seed,
      speed: clampNumber(Math.round(next.speed), 1, 720),
      scenario: next.scenario
    })
  );
}

function loadClock(config: MockSimConfig): SimClock {
  const raw = localStorage.getItem(CLOCK_KEY);
  const parsed = raw ? safeJsonParse<Partial<SimClock>>(raw) : null;
  const now = Date.now();

  const real0 = typeof parsed?.real0 === "number" ? parsed.real0 : now;
  const sim0 = typeof parsed?.sim0 === "number" ? parsed.sim0 : now;
  const speed = typeof parsed?.speed === "number" ? parsed.speed : config.speed;

  return { real0, sim0, speed };
}

function saveClock(clock: SimClock) {
  localStorage.setItem(CLOCK_KEY, JSON.stringify(clock));
}

export function getSimNow(config: MockSimConfig): Date {
  const now = Date.now();
  const clock = loadClock(config);

  if (clock.speed !== config.speed) {
    const currentSim = clock.sim0 + (now - clock.real0) * clock.speed;
    const next: SimClock = { real0: now, sim0: currentSim, speed: config.speed };
    saveClock(next);
    return new Date(next.sim0);
  }

  return new Date(clock.sim0 + (now - clock.real0) * clock.speed);
}

export function resetMockSimulation(opts?: { keepSeed?: boolean }) {
  const cfg = loadMockSimConfig();
  const nextSeed = opts?.keepSeed ? cfg.seed : `YLNU-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
  saveMockSimConfig({ ...cfg, seed: nextSeed });
  localStorage.removeItem(CLOCK_KEY);
  localStorage.removeItem("desk.mock.baselines.v1");
}
