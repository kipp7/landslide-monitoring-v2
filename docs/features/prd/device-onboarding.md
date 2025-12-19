# PRD：设备注册与身份发放（device_id + secret）

## 1. 背景

设备端无法可靠读取硬件唯一 ID，需要通过烧录/出厂写入身份；并且设备可能频繁断电，需要断电后仍能稳定上线。

## 2. 目标

- 提供“创建设备 → 生成身份包 → 烧录 → 上线鉴权”的闭环。
- 支持吊销设备（revoked）后立即拒绝 MQTT 上报。
- 避免在数据库/文档中泄露明文 secret（后端只存 hash）。

## 3. 非目标

- v1 不强制实现 mTLS 证书体系。
- v1 不强制实现 secret 轮换（可预留）。

## 4. 用户与场景

- 管理员：新增设备、绑定站点、导出身份包（用于烧录/二维码）。
- 设备：使用身份包连接 MQTT 并上报 telemetry。

## 5. 功能需求

- 设备创建：
  - 生成 `deviceId(UUID)` 与 `deviceSecret(随机32字节)`，明文只返回一次。
  - `deviceSecret` 服务端存 hash（见 DB 表）。
- 设备状态：
  - `inactive`：未启用/未上线
  - `active`：可上报
  - `revoked`：拒绝连接/拒绝发布
- 站点绑定：设备可绑定到一个站点（stationId）。

## 6. 验收标准

- 管理端创建设备后，能得到可用于烧录的身份包（deviceId + secret + 版本字段）。
- 设备用该身份连接 MQTT，能成功发布 `telemetry/{deviceId}`。
- 将设备置为 `revoked` 后，该设备发布被拒绝（鉴权/ACL 生效）。

## 7. 依赖

- ADR：`docs/architecture/adr/ADR-0002-device-identity-device-id-secret.md`
- MQTT 契约：`docs/integrations/mqtt/device-identity-and-auth.md`
- API 契约：`docs/integrations/api/03-devices.md`
- DB：`docs/integrations/storage/postgres/tables/03-devices.sql`

