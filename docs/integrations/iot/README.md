# integrations/iot/

该目录描述“非 MQTT 直连”的 IoT 接入方式（适配器/网关），以便在不破坏主链路（MQTT → Kafka → ClickHouse/Postgres）的前提下兼容旧系统或第三方平台。

索引：

- 华为云 IoT（HTTP Push）适配器：`docs/integrations/iot/huawei-iot-http-push.md`
- 华为/硬件 legacy 端点兼容层：`docs/integrations/iot/huawei-legacy-compat.md`
