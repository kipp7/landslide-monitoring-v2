# 配置与命令集合（Command Catalog，v2）

本文件定义“固件可接受的标准命令集合”，用于约束：

- 后端下发命令的 `command_type` 与 `payload` 形状
- App/Web 的操作入口（避免自由输入 JSON）
- 设备回执（ACK）应包含的结果字段

注意：命令消息体 schema 见：

- `docs/integrations/mqtt/schemas/device-command.v1.schema.json`
- `docs/integrations/mqtt/schemas/device-command-ack.v1.schema.json`

## 1. 通用约束

- `command_id`：UUID，由后端生成；用于幂等与审计
- `issued_ts`：UTC，后端生成
- 设备收到命令必须回 ACK：
  - `status=acked`：表示已执行/已应用
  - `status=failed`：表示无法执行（应附失败原因）

## 2. 标准命令列表

### 2.1 `set_config`

用途：动态调整采样与上报策略。

payload（示例）：

```json
{
  "sampling_s": 5,
  "report_interval_s": 5
}
```

约束：

- 设备端应校验范围（例如最小 1s、最大 3600s）
- 校验失败必须 `failed` 并返回原因

ACK result（示例）：

```json
{
  "applied": true,
  "effective": { "sampling_s": 5, "report_interval_s": 5 }
}
```

### 2.2 `ping`

用途：连通性检查与延迟评估（调试/运维）。

payload（示例）：

```json
{ "nonce": "abc123" }
```

ACK result（示例）：

```json
{ "nonce": "abc123", "fw": "1.0.0" }
```

### 2.3 `reboot`

用途：远程重启设备（谨慎使用，必须审计）。

payload（示例）：

```json
{ "reason": "apply_config" }
```

ACK result（示例）：

```json
{ "scheduled": true, "delay_ms": 1000 }
```

## 3. OTA（后续扩展）

v2 首期建议只预留命令名与字段，不强制实现完整 OTA 平台：

### 3.1 `ota_prepare`（预留）

payload（示例）：

```json
{
  "version": "1.0.1",
  "url": "https://example.local/firmware.bin",
  "sha256": "..."
}
```

说明：

- 真实实现需考虑断点续传、签名验证、A/B 分区切换与回滚
- 在单机形态下也要避免“远程误刷导致全站离线”

