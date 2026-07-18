import type { AppConfig } from "./config";

type AccessTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type HuaweiPushResult = {
  providerMessageId?: string;
  response: Record<string, unknown>;
};

export type HuaweiPushMessage = {
  eventId: string;
  alertId: string;
  eventType: string;
  severity: string;
  title: string;
  content: string;
  deviceId?: string | null | undefined;
  stationId?: string | null | undefined;
};

export class HuaweiPushProvider {
  private config: AppConfig;
  private accessToken = "";
  private accessTokenExpiresAtMs = 0;

  constructor(config: AppConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return this.config.huaweiPushEnabled && Boolean(
      this.config.huaweiPushClientId &&
      this.config.huaweiPushClientSecret &&
      this.config.huaweiPushSendUrl
    );
  }

  async send(tokens: string[], message: HuaweiPushMessage): Promise<HuaweiPushResult> {
    if (!this.isConfigured() || tokens.length === 0 || !this.config.huaweiPushSendUrl) {
      throw new Error("Huawei Push Kit is not configured");
    }
    const accessToken = await this.getAccessToken();
    const response = await fetch(this.config.huaweiPushSendUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        validate_only: false,
        message: {
          notification: {
            title: message.title,
            body: message.content
          },
          data: JSON.stringify({
            alertId: message.alertId,
            eventId: message.eventId,
            eventType: message.eventType,
            severity: message.severity,
            deviceId: message.deviceId ?? "",
            stationId: message.stationId ?? ""
          }),
          token: tokens
        }
      })
    });
    const payload = await this.responseJson(response);
    if (!response.ok) {
      throw new Error(`Huawei Push Kit request failed (${String(response.status)}): ${JSON.stringify(payload)}`);
    }
    const requestId = response.headers.get("request-id") ?? response.headers.get("x-request-id") ?? undefined;
    return {
      ...(requestId ? { providerMessageId: requestId } : {}),
      response: payload
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAtMs - 60_000) return this.accessToken;
    if (!this.config.huaweiPushClientId || !this.config.huaweiPushClientSecret) {
      throw new Error("Huawei Push Kit OAuth credentials are missing");
    }
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.huaweiPushClientId,
      client_secret: this.config.huaweiPushClientSecret
    });
    const response = await fetch(this.config.huaweiPushTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    const payload = await this.responseJson(response) as AccessTokenResponse & Record<string, unknown>;
    if (!response.ok || !payload.access_token) {
      throw new Error(`Huawei Push Kit OAuth failed (${String(response.status)}): ${JSON.stringify(payload)}`);
    }
    this.accessToken = payload.access_token;
    this.accessTokenExpiresAtMs = Date.now() + Math.max(300, payload.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }

  private async responseJson(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { raw: text };
    }
  }
}
