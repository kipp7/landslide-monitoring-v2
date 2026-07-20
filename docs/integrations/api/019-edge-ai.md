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
  "intent": "移动端请求立即复检当前边缘风险和链路状态"
}
```

仅允许：`recheck`、`collect_logs`、`generate_report`。
重启网关、修改串口、改告警规则和执行设备控制均会在 API 参数校验前被拒绝。

## 3) 数据边界

- 服务器模型保存在版本化 JSON artifact，并通过 retained MQTT 下发。
- RK3568 只读 `field-link-monitor` 快照，不接管串口或遥测上报。
- 边缘结果复用 PostgreSQL `ai_predictions` 和 Kafka `ai.predictions.v1`。
- 规则引擎仍是物理告警唯一权威，AI 结果只提供辅助研判。
