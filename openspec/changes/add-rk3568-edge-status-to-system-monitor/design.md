## Context

当前边缘侧已经形成三类稳定证据：

- `field-link-monitor`：板端链路质量与 node 在线状态摘要
- `field-gateway runtime`：southbound / northbound / parser / publish 等运行态详情
- `center soak`：当前主线是否仍处于已接受边界

软件侧当前真实消费入口是：

- API：`/api/v1/system/status`
- Web：`/ops/system-monitor`

这条软件读链目前只覆盖中心组件，不覆盖边缘侧。

## Goals / Non-Goals

- Goals:
  - 让软件侧能在现有系统监控页直接看到 RK3568 边缘状态
  - 保持 `/api/v1/system/status` 现有健康摘要语义不变
  - 只读消费已存在的稳定证据，不在请求路径引入新依赖
- Non-Goals:
  - 不做板端实时 RPC/SSH/串口探测
  - 不新增控制命令或告警联动
  - 不解决 `apps/desk` 现有 CPU/内存/磁盘历史兼容债

## Decisions

- Decision: Extend `/api/v1/system/status` with an optional `fieldEdge` block.
  - Why:
    - 这是现有运维权限和页面的最小插入点
    - 能保留旧消费者的兼容性
    - 不需要新增独立 read endpoint 和权限模型

- Decision: `fieldEdge` only reads local evidence artifacts, never reaches out to RK3568 in request handling.
  - Why:
    - 软件请求路径必须稳定、低延迟、可预测
    - SSH/板端 shell 属于运维脚本，不应进入在线 API 请求路径
    - 这能把“现场取证”和“软件展示”两个职责明确分离

- Decision: Treat `field-rk3568-field-link-monitor-latest.json` as the primary edge summary source.
  - Why:
    - 它已经把 gateway health、network status、node 状态收敛为单一 sidecar 摘要
    - `gateway-runtime-latest.json` 和 `center-soak-latest.json` 只作为补充证据

- Decision: Web UI must degrade gracefully when evidence is missing or stale.
  - Why:
    - 软件端不能因为现场证据暂缺就把整个系统监控页打坏
    - 需要让运维明确区分“中心健康”和“边缘证据缺失”

## Proposed `fieldEdge` Shape

```json
{
  "fieldEdge": {
    "available": true,
    "source": "rk3568_field_link_monitor",
    "generatedAt": "2026-04-10T16:43:28.403Z",
    "currentBoundary": "rk3568-edge-link-monitor-ready",
    "accepted": true,
    "summary": {
      "overallLevel": "attention",
      "score": 80,
      "networkMode": "sta_connected",
      "serialOpen": true,
      "mqttConnected": true,
      "portStatus": "online",
      "spoolPending": 0,
      "rejectedMessages": 2,
      "lastPublishedAgeSeconds": 0
    },
    "nodes": [
      {
        "fieldNodeId": "A",
        "deviceId": "00000000-0000-0000-0000-000000000001",
        "status": "online",
        "lastTelemetryAgeSeconds": 1,
        "ackPublishes": 0
      }
    ],
    "soak": {
      "accepted": true,
      "currentBoundary": "rk3568-center-soak-ready",
      "cleanWindowRounds": 2,
      "allAcked": true,
      "maxBoardObservationSchemaRejectedDelta": 0
    }
  }
}
```

## Risks / Trade-offs

- 风险: latest artifact 可能过期或未同步
  - Mitigation:
    - `fieldEdge.available=false` 或 `stale=true`
    - UI 明确展示“证据缺失/过期”，不伪装成健康

- 风险: 与 `add-system-resources-interface` 的 `/system/status` 语义讨论发生交叉
  - Mitigation:
    - 明确本变更不引入 CPU / 内存 / 磁盘资源模型
    - 只在健康摘要模型上新增边缘状态扩展区块

- 风险: 中心 API 运行目录与 repo root 不一致
  - Mitigation:
    - 后端统一从 repo-root helper 解析 artifact 路径
    - 缺失时返回 unavailable，而不是抛出 500

## Migration Plan

1. 在 `services/api` 增加只读 artifact reader
2. 扩展 `/api/v1/system/status` 返回 `fieldEdge`
3. 扩展 `/ops/system-monitor` UI
4. 用现有 latest reports 做最小验证
5. 更新月记、任务记忆与 authority 文档

## Open Questions

- 当前中心正式部署是否保证这些 latest artifacts 在 API 宿主机上持续可用
- 后续是否需要把 `field-link-monitor` 摘要改为平台内正式同步输入，而不再依赖 repo artifact
