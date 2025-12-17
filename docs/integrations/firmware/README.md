# integrations/firmware/

本目录描述“单片机端固件/设备代理（Device Agent）”的对接约束，聚焦：

- 设备端应该如何接入、重连、上报、回执（Why/What）
- 与 MQTT 契约（schemas/topics）如何配合（Interface）

注意：**MQTT 消息体的机器契约**仍以 `docs/integrations/mqtt/schemas/` 为准；本目录补充“设备运行行为与实现约束”。

## 索引

- 运行行为与重连：`docs/integrations/firmware/device-runtime-behavior.md`
- 采样与上报策略：`docs/integrations/firmware/telemetry-sampling-and-reporting.md`
- 配置与命令集合：`docs/integrations/firmware/ota-and-config.md`
- 身份写入与断电安全：参考 `docs/architecture/adr/ADR-0002-device-identity-device-id-secret.md`

## 相关契约入口

- MQTT：`docs/integrations/mqtt/README.md`
- MQTT 示例：`docs/integrations/mqtt/examples/README.md`

