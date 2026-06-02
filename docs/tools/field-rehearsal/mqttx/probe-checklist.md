---
title: probe-checklist
type: note
permalink: landslide-monitoring-v2-mainline/docs/tools/field-rehearsal/mqttx/probe-checklist
---

# MQTTX Probe Checklist

适用范围：A 路线联调中，使用 MQTTX 作为 MQTT 探针和人工验收工具。

目标：

- 验证 topic 是否正确
- 验证 payload 是否按预期发布
- 验证平台 ingress 是否可见

## 1) 连接准备

- Broker:
  - `mqtt://127.0.0.1:1883`
- 若启用 MQTT 鉴权：
  - username = `device_id`
  - password = `device_secret`

## 2) 订阅清单

建议至少订阅：

- `telemetry/+`
- `presence/+`
- `cmd/+`
- `cmd_ack/+`

如果只看单设备：

- `telemetry/<device_id>`
- `cmd/<device_id>`
- `cmd_ack/<device_id>`

## 3) 必验项

### 3.1 高频正常包

- 发布或观察：
  - `hf-normal`
- 断言：
  - `device_id` 存在
  - `metrics` 存在
  - 不包含 `install_label`
  - 包长处于预算内

### 3.2 低频补充包

- 发布或观察：
  - `lf-meta`
- 断言：
  - 低频字段出现在 `meta`
  - 高频字段不被污染

### 3.3 重复包

- 发布或观察：
  - `hf-duplicate`
- 断言：
  - `device_id + seq` 与已有包重复
  - 平台后续幂等链路可做对照

### 3.4 乱序包

- 发布或观察：
  - `hf-out-of-order`
- 断言：
  - 低序列包能被正常观察到
  - 后续平台时序判断可单独留证

### 3.5 超预算包

- 发布或观察：
  - `hf-oversized`
- 断言：
  - 网关或调试桩将其标记为拒绝/降级候选

### 3.6 重放包

- 发布或观察：
  - `hf-replay`
- 断言：
  - 能和正常实时包区分
  - 后续可在 replay 证据中定位

## 4) 人工验收记录

每次 probe 建议至少记录：

- 时间
- 当前目标 `device_id`
- 订阅 topic
- 收到的包类型
- 是否存在异常
- 是否已同步到 evidence 目录

## 5) 联调结论建议

MQTTX 适合：

- topic / payload 观察
- 手工复核
- 验收截图或人工笔记

MQTTX 不适合：

- 替代网关缓存/重放逻辑
- 替代自动化 acceptance probes