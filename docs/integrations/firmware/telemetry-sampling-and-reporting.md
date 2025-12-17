# 采样与上报策略（固件必须遵守）

目标：按“最坏情况”设计设备行为，但实现不写死，能通过命令动态调整；同时保证后端能长期承载。

## 1. 两个频率必须解耦

- `sampling_s`：采样周期（秒），决定数据精度与功耗
- `report_interval_s`：上报周期（秒），决定链路吞吐与存储增长

原则：

- sampling 可以比 report 更快（例如采样 1s、上报 5s，取窗口统计/最新值）
- report 可以根据网络质量动态拉长

## 2. 上报内容组织（稀疏指标）

设备每次上报为一个 TelemetryEnvelope：

- 必须包含：`schema_version`, `device_id`, `metrics`
- 可选包含：`event_ts`, `seq`, `meta`

约束：

- `metrics` 只包含“本次能读到的字段”，不需要字段一致
- 读不到的指标不要填 0 伪造，建议直接缺失或设为 `null`
- 指标 key 必须为 `snake_case`，例如 `battery_v`, `tilt_x_deg`

## 3. meta 字段使用建议

`meta` 用于低频变化、对排查有帮助的信息，示例：

- 固件版本：`fw`
- 配置：`sampling_s`, `report_interval_s`
- 电量模式：`power_mode`

约束：

- meta 允许冗余，但禁止包含 secret/token
- meta 中的配置仅用于可观测，最终配置以设备本地生效为准

## 4. 设备时间（event_ts）

设备如果无法可靠获得 UTC 时间：

- `event_ts` 可以设置为 `null`
- 后端以 `received_ts` 作为查询/聚合主时间

设备若具备可靠时钟（GPS/NTP/RTC）：

- 必须填 UTC RFC3339（`2025-12-15T10:00:00Z`）
- 设备端要监控“时间跳变”（例如 NTP 校准导致倒退）并记录到 meta（例如 `time_jump_ms`）

## 5. 最坏情况建议值（默认配置）

为了按最坏情况设计但不写死，建议给出“默认起步配置”，实现阶段可在后端配置中调整：

- `sampling_s`: 1~5
- `report_interval_s`: 5~30

说明：

- 单机链路压力主要来自 report_interval，而不是 sampling
- 采样频率提升时，建议上报做窗口聚合（min/max/avg/last）

