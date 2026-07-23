import { randomUUID } from "node:crypto";

export type JsonObject = Record<string, unknown>;
export type HermesActionName = "recheck" | "collect_logs" | "generate_report";
export type HermesActionStatus = "queued" | "running" | "completed" | "failed";

export type HermesAction = {
  id: string;
  requestId: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  action: HermesActionName;
  status: HermesActionStatus;
  requestedBy: string;
  naturalLanguageIntent: string | null;
  summary: string;
  result: JsonObject;
  error: string | null;
};

export type HermesActionRequest = {
  requestId: string;
  action: HermesActionName;
  requestedBy: string;
  naturalLanguageIntent: string | null;
};

export type HermesActionExecutionResult = {
  summary: string;
  result: JsonObject;
};

export type HermesActionQueueStatus = {
  queued: number;
  running: number;
  capacity: number;
};

type QueueOptions = {
  maxOutstanding: number;
  historyLimit?: number;
  idempotencyLimit?: number;
  execute: (request: HermesActionRequest) => Promise<HermesActionExecutionResult>;
  onTransition?: (action: HermesAction) => Promise<void>;
  onTransitionError?: (error: unknown, action: HermesAction) => void;
  now?: () => Date;
};

export class HermesActionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HermesActionConflictError";
  }
}

export class HermesActionQueueFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HermesActionQueueFullError";
  }
}

function cloneAction(action: HermesAction): HermesAction {
  return structuredClone(action);
}

function actionTimestamp(action: HermesAction): number {
  const parsed = Date.parse(action.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export class HermesActionQueue {
  private readonly recentActions: HermesAction[] = [];
  private readonly actionById = new Map<string, HermesAction>();
  private readonly requestIndex = new Map<string, HermesAction>();
  private readonly requestOrder: string[] = [];
  private executionChain: Promise<void> = Promise.resolve();
  private queued = 0;
  private running = 0;

  constructor(private readonly options: QueueOptions) {}

  status(): HermesActionQueueStatus {
    return {
      queued: this.queued,
      running: this.running,
      capacity: this.options.maxOutstanding,
    };
  }

  list(): HermesAction[] {
    return this.recentActions.map(cloneAction);
  }

  get(actionId: string): HermesAction | null {
    const action = this.actionById.get(actionId);
    return action ? cloneAction(action) : null;
  }

  async restore(events: HermesAction[]): Promise<void> {
    const latestById = new Map<string, HermesAction>();
    for (const event of events) latestById.set(event.id, cloneAction(event));
    const latest = Array.from(latestById.values()).sort(
      (left, right) => actionTimestamp(right) - actionTimestamp(left)
    );
    for (const action of latest.slice(0, this.idempotencyLimit()).reverse()) {
      if (action.status === "queued" || action.status === "running") {
        action.status = "failed";
        action.completedAt = this.isoNow();
        action.summary = "Hermes 重启前任务未完成，已安全终止";
        action.error = "service_restarted_before_completion";
        await this.emit(action);
      }
      this.remember(action);
    }
  }

  async enqueue(request: HermesActionRequest): Promise<{
    action: HermesAction;
    duplicate: boolean;
  }> {
    const existing = this.requestIndex.get(request.requestId);
    if (existing) {
      if (existing.action !== request.action) {
        throw new HermesActionConflictError(
          `requestId ${request.requestId} already belongs to ${existing.action}`
        );
      }
      return { action: cloneAction(existing), duplicate: true };
    }
    if (this.queued + this.running >= this.options.maxOutstanding) {
      throw new HermesActionQueueFullError("Hermes action queue is full");
    }

    const action: HermesAction = {
      id: randomUUID(),
      requestId: request.requestId,
      createdAt: this.isoNow(),
      startedAt: null,
      completedAt: null,
      action: request.action,
      status: "queued",
      requestedBy: request.requestedBy,
      naturalLanguageIntent: request.naturalLanguageIntent,
      summary: "任务已进入 Hermes 只读执行队列",
      result: { reportReady: false },
      error: null,
    };
    this.queued += 1;
    this.remember(action);
    await this.emit(action);
    this.executionChain = this.executionChain
      .then(() => this.run(action, request))
      .catch(() => undefined);
    return { action: cloneAction(action), duplicate: false };
  }

  async waitForIdle(): Promise<void> {
    await this.executionChain;
  }

  private async run(action: HermesAction, request: HermesActionRequest): Promise<void> {
    this.queued = Math.max(0, this.queued - 1);
    this.running += 1;
    action.status = "running";
    action.startedAt = this.isoNow();
    action.summary = "Hermes 正在执行只读任务";
    await this.emit(action);
    try {
      const completed = await this.options.execute(request);
      action.status = "completed";
      action.summary = completed.summary;
      action.result = completed.result;
      action.error = null;
    } catch (error) {
      action.status = "failed";
      action.summary = "Hermes 任务执行失败，监测主链路未受影响";
      action.result = { reportReady: false };
      action.error = error instanceof Error ? error.message : String(error);
    } finally {
      action.completedAt = this.isoNow();
      this.running = Math.max(0, this.running - 1);
      await this.emit(action);
    }
  }

  private remember(action: HermesAction): void {
    this.actionById.set(action.id, action);
    this.requestIndex.set(action.requestId, action);
    if (!this.requestOrder.includes(action.requestId)) this.requestOrder.push(action.requestId);
    const existingIndex = this.recentActions.findIndex((entry) => entry.id === action.id);
    if (existingIndex >= 0) this.recentActions.splice(existingIndex, 1);
    this.recentActions.unshift(action);
    this.recentActions.splice(this.historyLimit());
    while (this.requestOrder.length > this.idempotencyLimit()) {
      const requestId = this.requestOrder.shift();
      if (!requestId) continue;
      const expired = this.requestIndex.get(requestId);
      this.requestIndex.delete(requestId);
      if (expired && !this.recentActions.some((entry) => entry.id === expired.id)) {
        this.actionById.delete(expired.id);
      }
    }
  }

  private async emit(action: HermesAction): Promise<void> {
    try {
      await this.options.onTransition?.(cloneAction(action));
    } catch (error) {
      this.options.onTransitionError?.(error, cloneAction(action));
    }
  }

  private isoNow(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }

  private historyLimit(): number {
    return this.options.historyLimit ?? 25;
  }

  private idempotencyLimit(): number {
    return this.options.idempotencyLimit ?? 256;
  }
}
