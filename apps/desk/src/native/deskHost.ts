type DeskHostMessage =
  | { type: "app"; action: "quit" }
  | { type: "app"; action: "show" }
  | { type: "app"; action: "hide" }
  | { type: "app"; action: "focus" }
  | { type: "app"; action: "openLogsDir" }
  | { type: "app"; action: "toggleTray"; payload?: { enabled?: boolean } }
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
};

function getBridge(): WebView2Bridge | null {
  if (typeof window === "undefined") return null;
  const chromeLike = (window as unknown as { chrome?: { webview?: WebView2Bridge } }).chrome;
  return chromeLike?.webview ?? null;
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
