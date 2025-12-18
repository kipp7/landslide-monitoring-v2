# EMQX HTTP 鉴权/ACL 接线（单机）

目标：把 EMQX 的鉴权（authn）与 ACL（authz）接到 `api-service`，实现：

- 设备连接鉴权：`username=device_id`，`password=device_secret`
- Topic ACL：设备只能访问自己的 topic（`telemetry/{device_id}`、`cmd/{device_id}` 等）
- 吊销立即生效：设备状态为 `revoked` 时直接拒绝

本项目实现的回调接口（由 EMQX 调用）：

- `POST http://<api-host>:<api-port>/emqx/authn`
- `POST http://<api-host>:<api-port>/emqx/acl`

## 1) 前置条件

- PostgreSQL 已初始化（`infra/compose/scripts/init-postgres.ps1` 已跑过）
- `api-service` 已启动（本机进程即可）
- 已有设备记录（`POST /api/v1/devices` 创建，会返回一次性 `deviceSecret`）

## 2) api-service 配置（推荐）

编辑 `services/api/.env`：

- `EMQX_WEBHOOK_TOKEN`：给 webhook 加一个共享密钥（推荐必须设置）
- `MQTT_INTERNAL_USERNAME` / `MQTT_INTERNAL_PASSWORD`：给服务端内部 MQTT 客户端（例如 `ingest-service`）预留一个“超级用户”账号（订阅 `telemetry/+` 需要）

说明：

- 当 `EMQX_WEBHOOK_TOKEN` 有值时，EMQX 调用 webhook 必须带 header：`x-emqx-token: <token>`

## 3) EMQX 侧配置（Dashboard 操作）

打开 EMQX Dashboard：`http://localhost:18083`

在 Access Control 中：

1) Authentication：新增 HTTP authenticator
   - URL：`http://host.docker.internal:8080/emqx/authn`（Windows Docker Desktop 推荐）
   - Method：POST
   - Headers：`x-emqx-token: <EMQX_WEBHOOK_TOKEN>`
2) Authorization：新增 HTTP authorizer
   - URL：`http://host.docker.internal:8080/emqx/acl`
   - Method：POST
   - Headers：`x-emqx-token: <EMQX_WEBHOOK_TOKEN>`

注意：

- `host.docker.internal` 在 Windows/macOS Docker Desktop 可用；如果是 Linux，需要改成能从容器访问到宿主机的地址，或把 `api-service` 也容器化后走 Compose 内网地址。

## 4) 设备与服务端账号约定

### 4.1 设备账号

- `username = device_id`（UUID）
- `password = device_secret`（创建设备时返回的一次性明文）

### 4.2 服务端内部账号（ingest）

当启用鉴权后，`ingest-service` 需要使用内部账号连接 EMQX（否则无法订阅 `telemetry/+`）：

- `MQTT_USERNAME = MQTT_INTERNAL_USERNAME`
- `MQTT_PASSWORD = MQTT_INTERNAL_PASSWORD`

## 5) 回调请求/响应（实现约定）

为了兼容不同 Content-Type，`api-service` 同时支持 JSON 与 `application/x-www-form-urlencoded`。

### 5.1 `/emqx/authn`

请求字段（至少包含）：

- `username`
- `password`

响应：

- `{"result":"allow","is_superuser":false}` 或 `{"result":"deny"}`

### 5.2 `/emqx/acl`

请求字段（至少包含）：

- `username`
- `action`：`publish|subscribe`
- `topic`

响应：

- `{"result":"allow"}` 或 `{"result":"deny"}`

