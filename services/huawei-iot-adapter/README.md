# huawei-iot-adapter

用途：兼容“华为云 IoT HTTP 推送/第三方 HTTP 推送”场景，将 HTTP 上报转换为 `telemetry.raw.v1` 写入 Kafka，进入 v2 主链路（Kafka → ClickHouse/Postgres）。

入口与契约：

- `docs/integrations/iot/README.md`
- `docs/integrations/iot/huawei-iot-http-push.md`

运行（示例）：

- `copy services\\huawei-iot-adapter\\.env.example services\\huawei-iot-adapter\\.env`
- `npm -w services/huawei-iot-adapter run build`
- `npm -w services/huawei-iot-adapter run start`

