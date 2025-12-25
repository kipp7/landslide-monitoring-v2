# API 接口设计（v2）

本版本与后端 v2 架构一致：`MQTT + Kafka + ClickHouse(遥测) + PostgreSQL(元数据/规则/告警) + Redis`，并以“稀疏指标、不写死、可扩展”为前提。

机器可读契约入口（用于生成 SDK/Mock 与做契约校验）：

- `docs/integrations/api/openapi.yaml`

## 设计原则

1. RESTful 风格：资源导向，HTTP 动词语义明确
2. 契约优先：API 文档先行，前端/Flutter 只依赖 API
3. 统一响应：结构化返回与标准化错误码
4. 统一 ID：所有业务 ID 使用 UUID 字符串
5. 时间统一：RFC3339 UTC（`2025-12-15T10:00:00Z`）

## 基础信息

- Base URL：`/api/v1`
- 认证方式：Bearer Token（JWT）
- 数据格式：JSON

## 统一响应格式

成功响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {},
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

分页响应：
```json
{
  "success": true,
  "code": 200,
  "message": "ok",
  "data": {
    "list": [],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5
    }
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

错误响应：
```json
{
  "success": false,
  "code": 400,
  "message": "参数错误",
  "error": {
    "field": "endTime",
    "detail": "endTime 必须大于 startTime"
  },
  "timestamp": "2025-12-15T10:00:00Z",
  "traceId": "req_01J..."
}
```

## 错误码约定

- `200`：成功
- `400`：参数错误
- `401`：未认证
- `403`：无权限
- `404`：资源不存在
- `409`：资源冲突
- `429`：限流
- `500`：服务端错误

## API 模块

- `01-auth.md`：认证接口
- `02-users.md`：用户管理
- `03-devices.md`：设备管理（UUID deviceId + 设备身份包下发）
- `04-stations.md`：站点管理（UUID stationId）
- `05-data.md`：数据接口（稀疏指标：sensorKey + metrics）
- `06-alerts.md`：告警接口（版本化规则 + 事件化告警）
- `07-system.md`：系统接口（配置/日志/状态）
- `08-gps-baselines.md`：GPS 基线（高精度定位基准）
- `015-patrol.md`：巡查上报（移动端）
- `016-sos.md`：紧急求救（移动端）
