import http from '@ohos.net.http';
import util from '@ohos.util';
import { ApiClient } from './ApiClient';
import { AlertStreamEvent } from './Types';

type AlertEventHandler = (event: AlertStreamEvent) => void;

export class AlertStreamClient {
  private api: ApiClient;
  private eventHandler: AlertEventHandler;
  private request: http.HttpRequest | null = null;
  private reconnectTimer: number | undefined = undefined;
  private stopped: boolean = true;
  private connecting: boolean = false;
  private pendingText: string = '';
  private lastEventId: string = '';
  private decoder: util.TextDecoder = util.TextDecoder.create('utf-8');
  private seenEventIds: Array<string> = [];

  constructor(api: ApiClient, eventHandler: AlertEventHandler) {
    this.api = api;
    this.eventHandler = eventHandler;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.connecting = false;
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.closeRequest();
    this.pendingText = '';
  }

  private closeRequest(): void {
    if (!this.request) return;
    try {
      this.request.off('dataReceive');
      this.request.off('dataEnd');
      this.request.destroy();
    } catch {
      // The request can already be closed by the network stack.
    }
    this.request = null;
  }

  private scheduleReconnect(delayMs: number = 3000, replaceExisting: boolean = false): void {
    if (this.stopped) return;
    if (this.reconnectTimer !== undefined && !replaceExisting) return;
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delayMs);
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting || !this.api.hasSession()) return;
    this.connecting = true;
    this.closeRequest();
    this.pendingText = '';

    const request = http.createHttp();
    this.request = request;
    request.on('dataReceive', (data: ArrayBuffer) => this.receive(data));
    request.on('dataEnd', () => {
      this.connecting = false;
      this.closeRequest();
      this.scheduleReconnect();
    });

    const headers: Record<string, string> = {
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${this.api.getAccessToken()}`,
      'Cache-Control': 'no-cache'
    };
    if (this.lastEventId.length > 0) headers['Last-Event-ID'] = this.lastEventId;

    try {
      const responseCode = await request.requestInStream(`${this.api.getBaseUrl()}/alerts/stream`, {
        method: http.RequestMethod.GET,
        header: headers,
        connectTimeout: 10000,
        readTimeout: 45000,
        usingCache: false
      });
      this.connecting = false;
      if (this.stopped) {
        this.closeRequest();
        return;
      }
      if (responseCode === 401 && await this.api.refreshSession()) {
        this.closeRequest();
        this.scheduleReconnect();
        return;
      }
      if (responseCode < 200 || responseCode >= 300) {
        this.closeRequest();
        const delayMs = responseCode === 403 || responseCode === 404 ? 30000 : 3000;
        this.scheduleReconnect(delayMs, true);
      }
    } catch {
      this.connecting = false;
      this.closeRequest();
      this.scheduleReconnect();
    }
  }

  private receive(data: ArrayBuffer): void {
    const decoded = this.decoder.decodeToString(new Uint8Array(data), { stream: true });
    this.pendingText = (this.pendingText + decoded).replace(/\r\n/g, '\n');
    let boundary = this.pendingText.indexOf('\n\n');
    while (boundary >= 0) {
      const block = this.pendingText.slice(0, boundary);
      this.pendingText = this.pendingText.slice(boundary + 2);
      this.consumeBlock(block);
      boundary = this.pendingText.indexOf('\n\n');
    }
  }

  private consumeBlock(block: string): void {
    const lines = block.split('\n');
    let eventName = 'message';
    let eventId = '';
    const dataLines: Array<string> = [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      if (line.startsWith('id:')) eventId = line.slice(3).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (eventId.length > 0) this.lastEventId = eventId;
    if (eventName !== 'alert' || dataLines.length === 0) return;

    try {
      const event = JSON.parse(dataLines.join('\n')) as AlertStreamEvent;
      if (!event.eventId || !event.alertId || this.seenEventIds.includes(event.eventId)) return;
      this.seenEventIds.push(event.eventId);
      if (this.seenEventIds.length > 128) this.seenEventIds.shift();
      this.eventHandler(event);
    } catch {
      // A malformed event is ignored; the stream remains connected.
    }
  }
}
