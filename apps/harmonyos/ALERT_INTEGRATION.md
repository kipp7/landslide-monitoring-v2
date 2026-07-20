# HarmonyOS 告警联动接口

鸿蒙 App 不维护告警副本数据库。前台实时提醒、系统通知和告警地图都以服务器告警记录为准。

## 前台实时接口

App 登录并处于前台时连接：

```http
GET /api/v1/alerts/stream
Accept: text/event-stream
Authorization: Bearer <access-token>
Last-Event-ID: <last-event-id>
```

服务器使用 SSE 的 `alert` 事件发送告警。`id` 与数据中的 `eventId` 必须相同：

```text
id: 3cae3f27-63d2-4f2a-9fe1-54c57d727463
event: alert
data: {"type":"alert","eventId":"3cae3f27-63d2-4f2a-9fe1-54c57d727463","alertId":"d2e7ca4b-63e2-4d0a-9ff8-2f045eb6ed86","eventType":"ALERT_TRIGGER","severity":"high","title":"节点 B 倾角告警","message":"Y 轴倾角超过预警阈值","deviceId":"...","stationId":"...","evidence":{"latitude":24.43803,"longitude":118.09631},"createdAt":"2026-07-20T02:10:00.000Z"}
```

字段约定：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `eventId` | 是 | 告警事件唯一 ID，用于 SSE 续传和客户端去重 |
| `alertId` | 是 | 告警生命周期 ID，用于详情、事件和地图接口 |
| `eventType` | 是 | `ALERT_TRIGGER`、`ALERT_UPDATE`、`ALERT_ACK` 或 `ALERT_RESOLVE` |
| `severity` | 是 | `low`、`medium`、`high` 或 `critical` |
| `title` | 是 | 面向值守人员的简短中文标题 |
| `message` | 是 | 告警原因和关键数值，不包含操作说明 |
| `deviceId` | 否 | 触发告警的监测设备 |
| `stationId` | 否 | 设备所属站点 |
| `evidence` | 否 | 告警证据；GPS 建议放在 `latitude`、`longitude`，也兼容 `gps.latitude`、`gps.longitude` |
| `createdAt` | 是 | ISO 8601 UTC 时间 |

`ALERT_TRIGGER` 会打开应用内强提醒并启动循环警报音；同一 `alertId` 的 `ALERT_UPDATE` 会原位更新原因和证据，升级到 `critical` 时重新打开强提醒并鸣响。`ALERT_ACK` 会停止并移除该条强提醒，但服务器告警中心仍保留“已确认待复核”；只有同一 `alertId` 的 `ALERT_RESOLVE` 才会结束服务器端告警生命周期。值守人员也可只在本机暂时静音，告警仍可从告警中心和地图查看。

多个节点同时告警时，App 按 `alertId` 维护队列；后续更新替换同一条告警，不得按 `eventId` 追加成重复告警。比赛倾角告警的 `evidence` 使用 `baseline`、`current`、`delta`、`maxAxis`、`maxDeviationDeg` 和 `thresholds`，与 Windows 端共用同一字段。

## 地图依赖接口

点击“查看定位”后，App 使用同一 `alertId` 拉取：

```http
GET /api/v1/alerts/{alertId}/events
GET /api/v1/stations
GET /api/v1/devices
GET /api/v1/data/state/{deviceId}
GET /api/v1/data/series/{deviceId}
```

定位优先级为告警证据 GPS、设备实时 GPS、设备七日历史 GPS、最后有效 GPS、站点 GPS、厦门大学默认位置。

## 后台 Push

后台推送继续使用现有设备注册接口：

```http
POST /api/v1/push/devices
DELETE /api/v1/push/devices
```

Push `data` 至少携带 `alertId`；建议与 SSE 完全复用 `eventId`、`eventType`、`severity`、`deviceId` 和 `stationId`。用户点击系统通知进入 App 后，App 会先展示应用内告警面板，再由用户选择是否打开地图。服务器不需要为 App 新建业务数据库。
