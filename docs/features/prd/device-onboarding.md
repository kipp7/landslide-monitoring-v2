---
title: device-onboarding
type: note
permalink: landslide-monitoring-v2-mainline/docs/features/prd/device-onboarding
---

﻿# PRD：设备注册与身份发放（device_id + secret）

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
- 恢复已停用设备：
  - 允许通过正式 API 将 `revoked` 设备恢复到停用前的原始 registry 状态
  - 恢复后保留原站点绑定、正式命名与审计链
- 站点绑定：设备可绑定到一个站点（stationId）。

### 5.1 状态语义（2026-04 主线）

当前桌面端和运行手册必须明确区分三层状态，不能混写成一个“设备状态”：

1. `devices.status`
   - 表示接入控制状态
   - `inactive`：台账已登记，但未启用设备直连鉴权
   - `active`：台账已启用设备直连鉴权
   - `revoked`：设备已停用，平台拒绝接入与发布
2. `metadata.lifecycleStatus`
   - 表示业务投运阶段
   - 例如：`pending_commissioning`、`commissioned`、`maintenance`、`decommissioned`
3. `online/offline/warning`
   - 表示运行在线态
   - 由 `last_seen_at / device_state` 的新鲜度推导

对 RK3568 代管的现场节点，允许出现下面这种正常组合：

- `devices.status = inactive`
- `lifecycleStatus = commissioned`
- 运行在线态 = `online`

这不表示异常，只表示该节点走的是“网关代管上送”主线，而不是“设备自己直连 MQTT”主线。

## 6. 验收标准

- 管理端创建设备后，能得到可用于烧录的身份包（deviceId + secret + 版本字段）。
- 设备用该身份连接 MQTT，能成功发布 `telemetry/{deviceId}`。
- 将设备置为 `revoked` 后，该设备发布被拒绝（鉴权/ACL 生效）。
- 对已停用设备执行恢复后，应回到停用前的原始 registry 状态，并保留审计记录。

## 7. 依赖

- ADR：`docs/architecture/adr/ADR-0002-device-identity-device-id-secret.md`
- MQTT 契约：`docs/integrations/mqtt/device-identity-and-auth.md`
- API 契约：`docs/integrations/api/03-devices.md`
- DB：`docs/integrations/storage/postgres/tables/03-devices.sql`

## 8. 当前实施闭环（2026-04 主线）

当前如果讨论“现场正式设备注册 / 正式命名 / baseline 确立”这条线，统一以：

- `docs/guides/runbooks/field-formal-device-commissioning-runbook.md`

为唯一操作入口，不再把这三件事拆散理解。

现阶段主线有两条并行身份路径，不能混为一谈：

- 直连 MQTT 设备：
  - 采用“后台先发身份包，设备烧录后首次上线自动激活”的方式。
- RK3568 代管的现场节点：
  - 采用“平台预建档 + RK3568 southbound 映射固化 + 节点按既定 `device_id` 上送”的方式。
  - 不采用“节点首启向平台申领身份”。

### 8.1 直连 MQTT 设备

实施步骤：

1. 管理端调用 `POST /devices`
   - 后端生成 `deviceId(UUID)` 与 `deviceSecret`
   - 数据库仅保存 `device_secret_hash`
   - 设备初始状态写为 `inactive`
2. 管理端立即保存一次性返回的身份包
   - 当前最小身份包内容：`deviceId`、`deviceSecret`、`schemaVersion`、`credVersion`
   - `deviceSecret` 明文只返回一次，丢失后应重新发放而不是回查
3. 将身份包烧录到设备配置
   - RK2206 / RK3568 侧都按同一身份模型保存
   - 一台物理设备对应一套独立身份，不能复用
4. 设备首次上线时使用 MQTT 鉴权
   - `username = deviceId`
   - `password = deviceSecret`
5. 首次鉴权成功后自动激活
   - EMQX 鉴权路径会把 `devices.status` 从 `inactive` 更新为 `active`
   - 同时写入 `last_seen_at`
6. 后续运行与运维
   - 设备继续按 `deviceId` 上报 telemetry / ACK
   - 若设备丢失、替换或泄露，执行 `PUT /devices/{deviceId}/revoke`

### 8.2 RK3568 代管现场节点

适用范围：

- RK2206 分节点通过 XL01 汇聚到中心节点，再由 RK3568 `field-gateway` 统一上送 MQTT / API。
- 当前山体滑坡现场主线属于这一类。

实施步骤：

1. 运维先在平台创建设备台账
   - 先创建/更新 `station`
   - 再按现场固定 `device_id` 创建 `devices` 记录
   - 设备 metadata 需补齐 `identityClass=formal`、`stationCode`、`regionCode`、`slopeCode`、`nodeCode`、`gatewayCode`、`installLabel`
   - 站点 metadata 也必须持久化 `stationCode`、`regionCode`、`slopeCode`、`gatewayCode`
   - 对早期台账使用 `scripts/dev/backfill-field-canonical-metadata.ps1` 做一次安全回填
2. 固化 RK3568 southbound 映射
   - 在 `SOUTHBOUND_NODES_JSON` 中声明 `fieldNodeId -> deviceId -> southboundPort`
   - 当前主线入口：
     - `scripts/dev/register-field-formal-devices.ps1`
     - `scripts/dev/run-field-formal-device-commissioning.ps1`
     - `scripts/dev/set-rk3568-field-gateway-southbound-nodes.ps1`
3. 节点继续按固化 `device_id` 上送
   - RK2206 不直接向平台申领身份
   - 平台依赖 payload 中的 `device_id` 与 registry 对齐
4. telemetry 到达后刷新运行态
   - `telemetry-writer` 会更新 `devices.last_seen_at`
   - Desk/API 通过 registry + `device_state` 展示正式设备
5. 密钥边界
   - 当前 shared-port field path 的 MQTT 连接由 RK3568 `field-gateway` 统一持有
   - `deviceSecret` 可以保留在 registry 身份包中，但当前不是 RK2206 节点日常上线的必要条件

## 9. 当前未做的事

- 未实现设备首启自主 claim/register 流程
- 未实现桌面端一键导出烧录包 / 二维码发放界面
- 未实现 secret 在线轮换

这三项都属于后续增强项，不影响当前 3 台设备主线接入与交付。
