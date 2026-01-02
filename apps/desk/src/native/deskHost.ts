type DeskHostMessage =
  | { type: "app"; action: "quit" }
  | { type: "app"; action: "show" }
  | { type: "app"; action: "hide" }
  | { type: "app"; action: "focus" }
  | { type: "app"; action: "openLogsDir" }
  | { type: "app"; action: "toggleTray"; payload?: { enabled?: boolean } }
  | {
      type: "app";
      action: "setTrayBehavior";
      payload?: { minimizeToTray?: boolean; closeToTray?: boolean };
    }
  | { type: "app"; action: "toggleFullscreen" }
  | { type: "app"; action: "enterFullscreen" }
  | { type: "app"; action: "exitFullscreen" }
  | { type: "app"; action: "reload" }
  | { type: "app"; action: "minimize" }
  | { type: "app"; action: "maximize" }
  | { type: "app"; action: "restore" }
  | { type: "app"; action: "openExternal"; payload: { url: string } }
  | {
      type: "app";
      action: "notify";
      payload: {
        title?: string;
        message: string;
        route?: string;
        level?: "info" | "warning" | "error";
        timeoutMs?: number;
      };
    };

type WebView2Bridge = {
  postMessage: (message: unknown) => void;
  addEventListener?: (type: "message", listener: (event: { data: unknown }) => void) => void;
  removeEventListener?: (type: "message", listener: (event: { data: unknown }) => void) => void;
};

export type DeskHostInfo = {
  app?: { name?: string; version?: string };
  webview2?: { browserVersion?: string; userDataFolder?: string; additionalArgs?: string };
  os?: { version?: string };
};

type DeskHostResultMessage =
  | { type: "appResult"; requestId: string; ok: true; payload?: unknown }
  | { type: "appResult"; requestId: string; ok: false; error?: { message?: string } };

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timeoutId: number;
};

const pendingRequests = new Map<string, PendingRequest>();
let bridgeListenerAttached = false;

function getBridge(): WebView2Bridge | null {
  if (typeof window === "undefined") return null;
  const chromeLike = (window as unknown as { chrome?: { webview?: WebView2Bridge } }).chrome;
  return chromeLike?.webview ?? null;
}

export function getDeskHostInfo(): DeskHostInfo | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __DESK_HOST_INFO?: DeskHostInfo };
  return w.__DESK_HOST_INFO ?? null;
}

function parseResultMessage(data: unknown): DeskHostResultMessage | null {
  const raw = typeof data === "string" ? data : null;
  let obj: unknown = data;

  if (raw) {
    try {
      obj = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  if (rec.type !== "appResult") return null;
  const requestId = rec.requestId;
  const ok = rec.ok;
  if (typeof requestId !== "string") return null;
  if (ok === true) return { type: "appResult", requestId, ok: true, payload: rec.payload };
  if (ok === false) return { type: "appResult", requestId, ok: false, error: rec.error as { message?: string } };
  return null;
}

function ensureBridgeListener() {
  if (bridgeListenerAttached) return;
  const bridge = getBridge();
  if (!bridge?.addEventListener) return;

  const handler = (event: { data: unknown }) => {
    const msg = parseResultMessage(event.data);
    if (!msg) return;
    const pending = pendingRequests.get(msg.requestId);
    if (!pending) return;
    pendingRequests.delete(msg.requestId);
    window.clearTimeout(pending.timeoutId);
    if (msg.ok) pending.resolve(msg.payload);
    else pending.reject(new Error(msg.error?.message ?? "桌面端请求失败"));
  };

  bridge.addEventListener("message", handler);
  bridgeListenerAttached = true;
}

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function isDeskHost(): boolean {
  return !!getBridge();
}

export function postDeskHostMessage(message: DeskHostMessage): boolean {
  const bridge = getBridge();
  if (!bridge) return false;
  bridge.postMessage(message);
  return true;
}

export function requestDeskHost<TPayload = unknown, TResult = unknown>(input: {
  action: string;
  payload?: TPayload;
  timeoutMs?: number;
}): Promise<TResult> {
  const bridge = getBridge();
  if (!bridge) return Promise.reject(new Error("当前运行环境不是桌面端"));
  ensureBridgeListener();

  const requestId = makeRequestId();
  const timeoutMs = Math.max(1500, Math.min(60000, input.timeoutMs ?? 15000));

  return new Promise<TResult>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("桌面端请求超时"));
    }, timeoutMs);

    pendingRequests.set(requestId, {
      resolve: (value) => resolve(value as TResult),
      reject,
      timeoutId
    });

    bridge.postMessage({
      type: "app",
      action: input.action,
      requestId,
      ...(input.payload !== undefined ? { payload: input.payload } : {})
    });
  });
}

export function requestDeskQuit(): boolean {
  return postDeskHostMessage({ type: "app", action: "quit" });
}

export function requestDeskFocus(): boolean {
  return postDeskHostMessage({ type: "app", action: "focus" });
}

export function requestDeskToggleTray(enabled?: boolean): boolean {
  const payload = enabled === undefined ? undefined : { enabled };
  return postDeskHostMessage({ type: "app", action: "toggleTray", ...(payload ? { payload } : {}) });
}

export function requestDeskNotify(input: {
  title?: string;
  message: string;
  route?: string;
  level?: "info" | "warning" | "error";
  timeoutMs?: number;
}): boolean {
  return postDeskHostMessage({ type: "app", action: "notify", payload: input });
}

export function requestDeskOpenExternal(url: string): boolean {
  return postDeskHostMessage({ type: "app", action: "openExternal", payload: { url } });
}

export function requestDeskOpenLogsDir(): boolean {
  return postDeskHostMessage({ type: "app", action: "openLogsDir" });
}

export function requestDeskSetTrayBehavior(input: {
  minimizeToTray?: boolean;
  closeToTray?: boolean;
}): boolean {
  return postDeskHostMessage({ type: "app", action: "setTrayBehavior", payload: input });
}

export function requestDeskToggleFullscreen(): boolean {
  return postDeskHostMessage({ type: "app", action: "toggleFullscreen" });
}

export function requestDeskReload(): boolean {
  return postDeskHostMessage({ type: "app", action: "reload" });
}

export type DeskImportFileResult = { canceled: boolean; files: string[] };
export type DeskExportFileResult = { canceled: boolean; filePath: string | null };

export function requestDeskImportFile(input?: {
  title?: string;
  filter?: string;
  multiple?: boolean;
  timeoutMs?: number;
}): Promise<DeskImportFileResult> {
  const timeoutMs = input?.timeoutMs;
  return requestDeskHost<typeof input, DeskImportFileResult>({
    action: "importFile",
    payload: input,
    ...(timeoutMs !== undefined ? { timeoutMs } : {})
  });
}

export function requestDeskExportFile(input?: {
  title?: string;
  filter?: string;
  suggestedFileName?: string;
  defaultExt?: string;
  timeoutMs?: number;
}): Promise<DeskExportFileResult> {
  const timeoutMs = input?.timeoutMs;
  return requestDeskHost<typeof input, DeskExportFileResult>({
    action: "exportFile",
    payload: input,
    ...(timeoutMs !== undefined ? { timeoutMs } : {})
  });
}

export function requestDeskGetAppInfo(input?: { timeoutMs?: number }): Promise<DeskHostInfo> {
  const timeoutMs = input?.timeoutMs;
  return requestDeskHost<typeof input, DeskHostInfo>({
    action: "getAppInfo",
    payload: input,
    ...(timeoutMs !== undefined ? { timeoutMs } : {})
  });
}

export function requestDeskWriteTextFile(input: {
  filePath: string;
  content: string;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = input.timeoutMs;
  return requestDeskHost<typeof input, unknown>({
    action: "writeTextFile",
    payload: input,
    ...(timeoutMs !== undefined ? { timeoutMs } : {})
  }).then(() => undefined);
}
