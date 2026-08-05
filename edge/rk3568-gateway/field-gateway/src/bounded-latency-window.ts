export type BoundedLatencySummary = {
  samplesTotal: number;
  samplesInWindow: number;
  windowCapacity: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  lastMs: number | null;
};

export class BoundedLatencyWindow {
  private readonly values: number[] = [];
  private samplesTotal = 0;
  private lastMs: number | null = null;

  constructor(private readonly capacity = 256) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4096) {
      throw new Error("latency window capacity must be in 1..4096");
    }
  }

  record(valueMs: number): void {
    if (!Number.isFinite(valueMs) || valueMs < 0) return;
    const roundedMs = Math.round(valueMs);
    this.samplesTotal += 1;
    this.lastMs = roundedMs;
    this.values.push(roundedMs);
    if (this.values.length > this.capacity) this.values.shift();
  }

  stats(): BoundedLatencySummary {
    const sorted = [...this.values].sort((left, right) => left - right);
    return {
      samplesTotal: this.samplesTotal,
      samplesInWindow: sorted.length,
      windowCapacity: this.capacity,
      p50Ms: percentile(sorted, 0.50),
      p95Ms: percentile(sorted, 0.95),
      maxMs: sorted.length > 0 ? sorted[sorted.length - 1] ?? null : null,
      lastMs: this.lastMs
    };
  }
}

function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? null;
}
