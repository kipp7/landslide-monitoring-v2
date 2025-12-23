# 华为云 IoT HTTP Push（适配器契约）

目标：兼容参考区的 `/iot/huawei` 思路，但在 v2 中以“独立适配器服务”的方式接入，并将上报写入 `telemetry.raw.v1`（进入主链路）。

## 1) 服务与端点

- Service：`services/huawei-iot-adapter`
- Endpoint：
  - v2：`POST /iot/huawei/telemetry`
  - legacy 兼容：`POST /iot/huawei`（等价别名）

健康检查：

- `POST /health`（返回 `{ ok: true }`）

## 2) 鉴权

如果配置了 `IOT_HTTP_TOKEN`，则请求必须携带：

- Header：`x-iot-token: <token>`

未配置 `IOT_HTTP_TOKEN` 时（本地开发/联调），允许匿名调用。

## 3) 请求体（JSON）

说明：为了降低接入成本，适配器支持 `camelCase` 与 `snake_case` 两种字段名。

必填字段：

- `deviceId` 或 `device_id`：UUID
- `metrics` 或 `data`：键值对（至少 1 个键）

可选字段：

- `eventTs` 或 `event_ts`：RFC3339（带时区，例如 `2025-12-22T12:00:00Z`）
- `seq`：整数（>=0）
- `meta`：任意对象（透传到 `telemetry.raw.v1.meta`）

示例：

```json
{
  "deviceId": "00000000-0000-0000-0000-000000000000",
  "eventTs": "2025-12-22T12:00:00Z",
  "seq": 42,
  "metrics": { "rain_mm": 1.2, "tilt_deg": 0.03 },
  "meta": { "source": "huawei-iot" }
}
```

## 4) 输出（Kafka）

Topic：`telemetry.raw.v1`

消息结构：见 `docs/integrations/kafka/schemas/telemetry-raw.v1.schema.json`

适配规则：

- `received_ts` 由适配器写入（服务端接收时间）
- `event_ts/seq/metrics/meta` 由请求体映射
- Kafka message key 使用 `device_id`
