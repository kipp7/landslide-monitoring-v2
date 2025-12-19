# PRD：单片机端固件适配（MQTT Device Agent，v2）

## 1. 背景

设备端可能频繁断电、网络不稳定、无法可靠读取硬件唯一 ID；同时传感器组合不固定、上报字段可能每次不同。固件必须实现“可恢复、可升级、可扩展、不写死”的设备代理能力。

## 2. 目标

- 设备用 `device_id + device_secret` 安全接入 MQTT，并能稳定重连。
- 支持稀疏遥测：每次仅上报实际存在/可读到的指标，不要求字段一致。
- 支持命令下发与回执（ACK），用于配置/控制/采样策略调整。
- 断电安全：身份与关键配置具备断电保护（A/B slot + CRC）。

## 3. 非目标（v2 首期）

- 不强制实现全量 OTA 平台化（可先实现“下载与切换”的最小闭环，后续完善）。
- 不要求设备端进行复杂规则判断（规则在后端 worker 执行；设备端只做采样与上报）。

## 4. 设备输入输出（I/O）

### 输入

- 传感器采样（数值/状态/字符串）
- 命令下发（MQTT topic）

### 输出

- 遥测上报（MQTT topic）
- 在线/离线事件（presence，可选）
- 命令回执（ACK topic）

## 5. 功能需求

### 5.1 身份与鉴权

- 身份字段：
  - `device_id`：UUID（烧录写入）
  - `device_secret`：随机 32 字节（烧录写入）
- 存储：A/B slot + CRC，确保掉电不会写坏导致“无法上线”
- 行为：连接失败必须指数退避，避免连接风暴

参考：

- ADR：`docs/architecture/adr/ADR-0002-device-identity-device-id-secret.md`
- MQTT 规范：`docs/integrations/mqtt/device-identity-and-auth.md`

### 5.2 遥测上报（Telemetry）

- 消息体必须符合 schema：`integrations/mqtt/schemas/telemetry-envelope.v1.schema.json`
- `metrics` 允许稀疏字段，字段名（key）必须为 `snake_case`
- `event_ts` 可为空（设备无可靠时钟时），服务端以 `received_ts` 作为主时间
- 必须支持 `seq`（单调递增或循环递增），用于乱序/去重辅助

### 5.3 在线状态（Presence，可选但推荐）

- 设备上线/离线事件符合：`integrations/mqtt/schemas/presence-event.v1.schema.json`
- Presence 用于“在线判定/排查连接问题”，不承载业务遥测

### 5.4 命令下发与回执（Command + Ack）

- 下发命令 schema：`integrations/mqtt/schemas/device-command.v1.schema.json`
- 回执 schema：`integrations/mqtt/schemas/device-command-ack.v1.schema.json`
- 固件必须保证：
  - 收到命令后要么 ACK 成功，要么 ACK 失败（含失败原因）
  - 不能“收到命令但不回执”

### 5.5 采样与上报策略

- 采样频率（sampling）与上报频率（report interval）必须解耦：
  - sampling：采集传感器的周期（秒）
  - report_interval：把最新/聚合后的数据上报的周期（秒）
- 支持后端动态调整（通过命令下发）

## 6. 非功能需求（NFR）

- 可靠性：断网/断电/重启后可自动恢复到可上线状态
- 安全性：不在串口/日志输出 `device_secret`；所有鉴权失败要可定位（错误码）
- 性能：单次上报 payload 控制大小；必要时分片（后续 spec 定义）
- 可维护：关键配置必须版本化（例如 `credVersion`、`schema_version`）

## 7. 验收标准

- 设备在断电 100 次后仍能正常连接与上报（A/B slot 验证）。
- 设备能够在弱网下自动重连，并保持指数退避（无连接风暴）。
- 遥测消息可通过 JSON Schema 校验（示例已提供）。
- 可下发 `set_config` 命令并收到 ACK（成功/失败均可）。

## 8. 依赖与引用

- MQTT 契约：`docs/integrations/mqtt/README.md`
- MQTT 示例：`docs/integrations/mqtt/examples/README.md`
- Kafka 契约（后端链路）：`docs/integrations/kafka/README.md`

