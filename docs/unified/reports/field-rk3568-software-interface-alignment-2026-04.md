---
title: field-rk3568-software-interface-alignment-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-software-interface-alignment-2026-04
---

# RK3568 网关与软件端接口对齐基线（2026-04）

## 状态

- topic: `field-rk3568-software-interface-alignment`
- state: `interface-baseline-frozen`
- updated_at: `2026-04-08`
- authority: `current`

## 1. 这份文档解决什么问题

RK3568 网关已经跑通了：

- `ttyS3 -> JSON 重组 -> MQTT telemetry`

但如果不把它和软件端正式接口对齐冻结，后续继续做：

- `3 x RK2206` southbound
- `manual_collect` / `set_config` 下行
- API / Web 设备命令入口

就容易再次出现：

- 网关和平台各自定义一套消息形状
- topic 命名漂移
- 字段语义不一致

所以这份文档只做一件事：

- 冻结 RK3568 网关后续实现必须服从的软件端接口真值

## 2. 直接挂靠的权威来源

本基线不重新发明协议，直接挂靠：

- [03-devices.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/integrations/api/03-devices.md)
- [mqtt-topics-and-envelope.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/integrations/mqtt/mqtt-topics-and-envelope.md)
- [ota-and-config.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/integrations/firmware/ota-and-config.md)
- [telemetry-sampling-and-reporting.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/integrations/firmware/telemetry-sampling-and-reporting.md)
- [field-rk3568-gateway-implementation-tasklist-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-implementation-tasklist-2026-04.md)

## 3. 当前必须对齐的三条正式消息链

### 3.1 遥测上行

RK3568 网关发布到软件端的正式上行必须是：

- topic:
  - `telemetry/{device_id}`
- payload:
  - `TelemetryEnvelope v1`

必保字段：

- `schema_version`
- `device_id`
- `metrics`

强烈建议保留：

- `seq`
- `event_ts`
- `meta`

约束：

- `device_id` 必须直接沿用分节点真实 `device_id`
- 网关不得发明新的“网关侧 device_id”替代节点身份
- `metrics` 继续走稀疏字段，不补 0，不伪造缺失传感器
- `metrics` key 继续使用 `snake_case`
- `meta` 只放低频可观测信息，不放 secret

### 3.2 命令下行

软件端对 RK3568 网关的正式下行入口必须仍然是：

- API:
  - `POST /devices/{deviceId}/commands`
- MQTT:
  - `cmd/{device_id}`
- payload:
  - `device-command.v1`

当前网关必须接受并向南向节点转译的最小命令集固定为：

- `manual_collect`
- `set_config`

其中：

- `set_config` 的 payload 必须兼容：
  - `sampling_s`
  - `report_interval_s`
- `manual_collect` 的 payload 允许透传扩展字段，但不能改变 `command_id` / `device_id` / `command_type`

### 3.3 命令回执上行

RK3568 网关后续补下行后，向软件端回灌的正式 ACK 必须是：

- topic:
  - `cmd_ack/{device_id}`
- payload:
  - `device-command-ack.v1`

必保字段：

- `schema_version`
- `command_id`
- `device_id`
- `ack_ts`
- `status`

约束：

- `status` 只能是：
  - `acked`
  - `failed`
- `result` 允许带：
  - `collect_requested`
  - `applied`
  - `applied_keys`
  - `runtime_config`
  - 或其它设备执行结果
- `command_id` 必须和 API / MQTT 下发命令保持一一对应

## 4. 设备身份一致性规则

后续 RK3568 网关实现必须保证以下四处身份完全一致：

1. API 路径中的 `deviceId`
2. MQTT topic 中的 `{device_id}`
3. MQTT payload 中的 `device_id`
4. 遥测/ACK 落库和前端查询中的 `device_id`

也就是说：

- 不允许网关内部再造一层“南向节点别名”去污染北向接口

如果现场需要维护：

- `field_node_id`
- `install_label`
- `southbound_port`

这些都应停留在：

- RK3568 内部 southbound 配置
- 或 telemetry `meta`

而不是替代正式 `device_id`

## 5. 当前南北向边界该怎么分

### 5.1 南向允许网关做的事

- 串口/XL01 输入恢复
- 分片重组
- 启动残片丢弃
- 本地 spool/cache
- southbound 端口到节点配置映射
- 平台命令到节点串口格式的最小转译

### 5.2 北向不允许网关做的事

- 改 topic 规则
- 改 canonical `device_id`
- 重命名平台已接受的 telemetry key
- 自定义另一套 ACK 基础字段
- 把 northbound contract 改成“网关聚合包”后再让后端适配

## 6. 对当前代码主线的直接影响

当前 `services/field-gateway` 第一版主链已经满足：

- `telemetry/{device_id}`
- `TelemetryEnvelope v1`

但后续扩展必须继续遵守：

1. 多节点 southbound 只能扩 southbound 配置模型
- 不能改 northbound telemetry contract

2. 下行实现只能补：
- `cmd/{device_id}` 消费
- 最小命令转译
- `cmd_ack/{device_id}` 回灌

3. RK3568 内部状态文件只能做本地证据
- 不能作为软件端正式读模型替代品

## 7. 下一阶段的代码落点

基于这份接口基线，下一阶段代码应按这个顺序推进：

### Step 1

先补 southbound 配置模型：

- `3 x RK2206`
- southbound port / node / device_id 映射

### Step 2

再补 northbound 下行入口：

- MQTT 订阅 `cmd/{device_id}`
- 校验 `device-command.v1`

### Step 3

再补 southbound 命令转译：

- `manual_collect`
- `set_config`

### Step 4

最后补 northbound ACK 回灌：

- `cmd_ack/{device_id}`
- `device-command-ack.v1`

## 8. 当前结论

RK3568 网关下一阶段不是“自由扩展现场协议”，而是：

- 在 southbound 侧吸收现场复杂性
- 在 northbound 侧严格服从软件端既有接口真值

当前冻结的对齐结论可以压成一句话：

- `南向可适配，北向必须标准`
