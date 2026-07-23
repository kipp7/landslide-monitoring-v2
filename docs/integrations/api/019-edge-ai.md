---
title: 019-edge-ai
type: note
permalink: landslide-monitoring-v2-mainline/docs/integrations/api/019-edge-ai
---

# 19) RK3568 Edge AI

该接口只代理 RK3568 Hermes 的旁路研判状态和安全动作。数据库、遥测写入、
规则告警及告警处置不经过该接口。

## 1) 状态

**GET** `/api/v1/edge-ai/status`

权限：`data:view`

响应 `data` 包含模型版本、MQTT 状态、各节点风险、最近自主任务和待上传数量。
Hermes 未配置或不可达时仍返回 HTTP 200，`available=false`、
`overallRiskLevel=unavailable`；App 可保留缓存，其他监测接口不受影响。

## 2) 安全动作

**POST** `/api/v1/edge-ai/actions`

权限：`system:config`

请求：

```json
{
  "action": "recheck",
  "intent": "移动端请求立即复检当前边缘风险和链路状态",
  "requestId": "harmonyos:recheck:m9a2n4:7fx3"
}
```

仅允许：`recheck`、`collect_logs`、`generate_report`。
重启网关、修改串口、改告警规则和执行设备控制均会在 API 参数校验前被拒绝。

首次提交会立即返回 `queued` 任务和 HTTP 200 API 信封，不等待 RK3568 执行完成。
App 必须为一次用户操作生成稳定的 `requestId`，认证刷新和网络重试复用该值。
相同 `requestId` 和动作只执行一次；同一 ID 改成其他动作会返回冲突。

## 3) 自然语言安全意图

**POST** `/api/v1/edge-ai/intents`

权限：`system:config`

请求：

```json
{
  "intent": "帮我检查 B 节点为什么危险",
  "requestId": "harmonyos:intent:m9a2p8:2kw7"
}
```

服务器只会将文字解析为上述三种白名单动作。涉及重启、切换网络、修改阈值、
触发或解除告警、写串口和控制设备的请求直接返回 `blocked=true`，不会访问板卡。
无法唯一识别时返回建议动作，不自动执行。

## 4) 动作历史

**GET** `/api/v1/edge-ai/actions`

权限：`data:view`

返回 RK3568 Hermes 最近 25 条安全动作及其执行结果，用于 App 任务时间线。

**GET** `/api/v1/edge-ai/actions/{actionId}`

权限：`data:view`

返回单个任务及当前队列状态。App 在提交后轮询该接口，直到任务进入
`completed` 或 `failed`。状态转换为 `queued -> running -> completed/failed`；
Hermes 重启前未完成的任务会变成 `failed`，不会自动重放。

Hermes 同时只执行一个任务，默认最多容纳 16 个排队和运行中的任务。队列已满时
返回 HTTP 429；这只影响 Hermes 安全任务，不阻塞 MQTT `cmd/+`、串口、遥测或节点任务传输。

## 5) 数据边界

- 服务器模型保存在版本化 JSON artifact，并通过 retained MQTT 下发。
- RK3568 Hermes 只读订阅现有 `telemetry/+` 并读取监督快照，不接管串口或遥测上报。
- 边缘结果复用 PostgreSQL `ai_predictions` 和 Kafka `ai.predictions.v1`。
- 规则引擎仍是物理告警唯一权威，AI 结果只提供辅助研判。
