import Dysmsapi, * as DysmsapiModels from "@alicloud/dysmsapi20170525";
import * as OpenApi from "@alicloud/openapi-client";
import type { AppConfig } from "./config";

export type SmsDeliveryRequest = {
  jobId: string;
  phoneE164: string;
  title: string;
  content: string;
  templateParams: Record<string, unknown>;
};

export type SmsDeliveryResult = {
  status: "sent" | "failed" | "skipped";
  providerMessageId?: string;
  providerResponse: Record<string, unknown>;
  errorMessage?: string;
};

export type SmsProvider = {
  providerName: string;
  send(request: SmsDeliveryRequest): Promise<SmsDeliveryResult>;
};

function assertAliyunConfig(config: AppConfig): void {
  const missing: string[] = [];
  if (!config.smsAliyunAccessKeyId) missing.push("SMS_ALIYUN_ACCESS_KEY_ID");
  if (!config.smsAliyunAccessKeySecret) missing.push("SMS_ALIYUN_ACCESS_KEY_SECRET");
  if (!config.smsAliyunSignName) missing.push("SMS_ALIYUN_SIGN_NAME");
  if (!config.smsAliyunTemplateCode) missing.push("SMS_ALIYUN_TEMPLATE_CODE");
  if (missing.length > 0) {
    throw new Error(`Aliyun SMS provider missing required env: ${missing.join(", ")}`);
  }
}

function compactPhoneForAliyun(phoneE164: string): string {
  const trimmed = phoneE164.trim();
  if (trimmed.startsWith("+86") && /^(\+86)1\d{10}$/.test(trimmed)) return trimmed.slice(3);
  return trimmed;
}

export function createSmsProvider(config: AppConfig): SmsProvider {
  if (config.smsProvider === "mock") {
    return {
      providerName: "mock",
      async send(request) {
        return {
          status: "sent",
          providerMessageId: `mock_${request.jobId}`,
          providerResponse: {
            provider: "mock",
            phoneE164: request.phoneE164,
            title: request.title
          }
        };
      }
    };
  }

  assertAliyunConfig(config);

  if (!config.smsRealSendEnabled) {
    return {
      providerName: "aliyun",
      async send(request) {
        return {
          status: "skipped",
          providerResponse: {
            provider: "aliyun",
            realSendEnabled: false,
            phoneE164: request.phoneE164,
            templateCode: config.smsAliyunTemplateCode
          },
          errorMessage: "SMS_REAL_SEND_ENABLED is not true"
        };
      }
    };
  }

  const aliyunConfig = new OpenApi.Config({
    accessKeyId: config.smsAliyunAccessKeyId,
    accessKeySecret: config.smsAliyunAccessKeySecret
  });
  aliyunConfig.endpoint = config.smsAliyunEndpoint;
  const client = new Dysmsapi(aliyunConfig);

  return {
    providerName: "aliyun",
    async send(request) {
      const params = {
        alertTitle: request.title,
        alertContent: request.content,
        ...request.templateParams
      };
      const smsRequest = new DysmsapiModels.SendSmsRequest({
        phoneNumbers: compactPhoneForAliyun(request.phoneE164),
        signName: config.smsAliyunSignName,
        templateCode: config.smsAliyunTemplateCode,
        templateParam: JSON.stringify(params),
        outId: request.jobId
      });

      const response = await client.sendSms(smsRequest);
      const body = response.body;
      const providerResponse = {
        statusCode: response.statusCode ?? null,
        requestId: body?.requestId ?? null,
        code: body?.code ?? null,
        message: body?.message ?? null,
        bizId: body?.bizId ?? null
      };

      if (body?.code === "OK") {
        const sentResult: SmsDeliveryResult = {
          status: "sent",
          providerResponse
        };
        if (body.bizId) sentResult.providerMessageId = body.bizId;
        return sentResult;
      }

      return {
        status: "failed",
        providerResponse,
        errorMessage: body?.message ?? `Aliyun SMS failed with code ${body?.code ?? "UNKNOWN"}`
      };
    }
  };
}
