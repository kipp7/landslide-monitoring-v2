type DeskHostMessage =
  | { type: "app"; action: "quit" }
  | { type: "app"; action: "toggleFullscreen" }
  | { type: "app"; action: "enterFullscreen" }
  | { type: "app"; action: "exitFullscreen" }
  | { type: "app"; action: "reload" }
  | { type: "app"; action: "minimize" }
  | { type: "app"; action: "maximize" }
  | { type: "app"; action: "restore" }
  | { type: "app"; action: "openExternal"; url: string };

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

