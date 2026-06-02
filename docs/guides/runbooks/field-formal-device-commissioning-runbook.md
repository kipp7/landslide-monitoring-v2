---
title: field-formal-device-commissioning-runbook
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/runbooks/field-formal-device-commissioning-runbook
---

# 现场正式设备投运 Runbook

这份 runbook 只负责一条线：

- 设备注册
- 正式命名
- GPS 基线确立

当前山体滑坡现场主线的唯一真值不是“设备首启自己申领身份”，而是：

1. 平台先预建正式站点和正式设备台账
2. RK3568 固化 `fieldNodeId -> deviceId -> southboundPort`
3. RK2206 节点按既定 `device_id` 上送
4. 平台在真实上报稳定后为需要 GPS 分析的节点确立 baseline
5. Desk / API 只按 formal 设备与 canonical identity 读数

## 1. 适用范围

适用于当前这条现场主线：

- `RK2206` 分节点
- `XL01` 中心节点汇聚
- `RK3568 field-gateway` 代管 northbound
- 平台 `API -> desk-win`

不适用于：

- 设备首启自主 claim/register
- 直连 MQTT 的独立终端
- `seed / replay / rehearsal / lab` 调试对象

## 2. 当前主线约束

必须同时遵守下面四条：

1. `device_id` 是机器身份
- 用于命令、审计、遥测归属、southbound 映射
- 不承载区域或点位语义

2. `station_code / region_code / slope_code / node_code / gateway_code` 是业务身份
- 用于正式命名、筛选、换板连续性和交付资料

3. `display_name / install_label` 是人类可读层
- 可以优化措辞
- 不能替代 `device_id`

4. baseline 在真实上报稳定后再建立
- 不能在设备还没稳定吐 GPS 点时抢先建立
- baseline 一旦用于正式分析，应留存为持久记录

## 2.1 三层状态语义

现场执行时，必须把下面三层状态分开看：

1. 接入控制状态：`devices.status`
- `inactive`：台账已登记，但未启用设备直连鉴权
- `active`：台账已启用设备直连鉴权
- `revoked`：设备已停用，平台拒绝接入与发布

2. 投运状态：`metadata.lifecycleStatus`
- 例如：
  - `pending_commissioning`
  - `commissioned`
  - `maintenance`
  - `decommissioned`

3. 运行在线态：`online / warning / offline`
- 由 `last_seen_at / device_state` 新鲜度推导
- 只反映最近上报和运行链是否新鲜

当前 RK3568 代管现场节点允许出现下面这种正常组合：

- 接入控制状态 = `inactive`
- 投运状态 = `commissioned`
- 运行在线态 = `online`

这说明该节点走的是“网关代管上送”主线，不是“节点自己直连 MQTT”主线。

## 3. 投运前必须先冻结的输入

在给现场设备上电前，先把这批输入定下来：

- `regionCode`
- `slopeCode`
- `stationCode`
- `stationName`
- `stationDisplayName`
- `gatewayCode`
- `gatewayDisplayName`
- 每个节点的：
  - `fieldNodeId`
  - `deviceId`
  - `installLabel`
  - `deviceType`
- 需要建立 GPS baseline 的节点范围

当前项目的默认样例已经固定为：

- `regionCode=CN-GX-YL-GBS`
- `slopeCode=LS-CN-GX-YL-GBS-001`
- `stationCode=ST-LS-CN-GX-YL-GBS-001-01`
- `gatewayCode=GW-CN-GX-YL-GBS-01`
- `A=00000000-0000-0000-0000-000000000001`
- `B=00000000-0000-0000-0000-000000000002`
- `C=00000000-0000-0000-0000-000000000003`

## 4. 标准执行顺序

### 4.1 唯一入口

当前主线统一入口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-field-formal-device-commissioning.ps1
```

该入口会按顺序完成：

1. 调用 `register-field-formal-devices.ps1`
2. 校验站点与设备 canonical identity 是否写对
3. 对需要的节点调用 `/api/v1/gps/baselines/{deviceId}/auto-establish`
4. 读取 baseline 详情与质量检查
5. 输出统一报告到 `docs/unified/reports/field-formal-device-commissioning-latest.json`

如果是历史台账，或者早期站点 metadata 里还没补齐 `stationCode / regionCode / slopeCode / gatewayCode`，先执行一次 canonical 回填：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\backfill-field-canonical-metadata.ps1
```

确认 dry-run 输出无误后，再执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\backfill-field-canonical-metadata.ps1 -Apply
```

### 4.2 当前现场的直接示例

当前三节点现场可直接运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-field-formal-device-commissioning.ps1 `
  -ApplySouthbound `
  -BoardHost 192.168.124.179 `
  -BoardUser linaro `
  -BaselineFieldNodeId A,B,C
```

如果当前只想先完成正式注册和命名，不立刻做 baseline：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-field-formal-device-commissioning.ps1 `
  -BaselineMode skip
```

### 4.3 停用与恢复闭环

当前正式 API 已支持受控停用与恢复：

1. 停用
- `PUT /api/v1/devices/{deviceId}/revoke`
- 预期结果：
  - workbench `formalCount` 减 1
  - 审计出现 `revoke_device`
  - 平台拒绝该设备后续接入

2. 恢复
- `PUT /api/v1/devices/{deviceId}/reactivate`
- 预期结果：
  - workbench `formalCount` 回到原值
  - 审计出现 `reactivate_device`
  - 设备恢复到停用前的原始接入控制状态，而不是固定写成 `active`

3. 演练通过标准
- 恢复后：
  - `stationCode / nodeCode / gatewayCode / installLabel` 不变
  - `lifecycleStatus` 不被破坏
  - `lastSeenAt / data.state.updatedAt` 能继续推进

## 5. 各步骤的通过标准

### 5.1 正式注册通过

至少满足：

- `station` 已存在且为目标 `stationCode`
- `devices` 已存在且 `deviceId` 与现场固件一致
- `firstRegistrationFlow.mode = gateway_preprovisioned`
- `SOUTHBOUND_NODES_JSON` 已与同一组 `deviceId` 对齐

### 5.2 正式命名通过

至少满足：

- 站点具备：
  - `stationCode`
  - `regionCode`
  - `slopeCode`
  - `displayName`
  - `lifecycleStatus`
- 设备具备：
  - `identityClass=formal`
  - `deviceRole`
  - `stationCode`
  - `regionCode`
  - `slopeCode`
  - `nodeCode`
  - `gatewayCode`
  - `displayName`
  - `installLabel`

### 5.3 baseline 通过

对被列入 `BaselineFieldNodeId` 的节点，至少满足：

- `GET /api/v1/gps/baselines/{deviceId}` 能读到持久 baseline
- baseline 坐标字段完整
- `quality-check` 可返回结果
- `recommendation.level` 不为 `bad`

## 6. 失败时怎么分流

### 6.1 baseline 建不起来

优先按下面顺序判断：

1. 设备是否已经持续上报 `gps_latitude / gps_longitude`
2. `deviceId` 是否已与 formal registry 对齐
3. RK3568 southbound 映射是否还是旧值
4. 上报窗口里是否还没有足够点数

这类问题不应回退正式命名，只应补上报与基线步骤后重跑本入口。

如果 commissioning 报告已经明确是 baseline 阶段失败，先跑这份诊断脚本再决定是“继续等点”“单节点重跑”还是“排查 GPS/天线”：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-gps-baseline-readiness.ps1
```

该脚本会输出：

- 当前设备在 ClickHouse 中的有效 GPS 点数量
- 是否存在跨会话混入风险
- 当前连续会话本身的漂移质量
- 对应节点下一步该怎么处理

### 6.2 换板

换板时的规则固定为：

- `stationCode / regionCode / slopeCode / nodeCode / gatewayCode` 保持不变
- 新板换新的 `deviceId`
- 重新写 southbound 映射
- 重新跑本 runbook
- 重新确立或复核 baseline

如果现场暂时没有备用板，只允许做“停用 -> 恢复”的受控演练，不要假设存在可替换的新硬件。

### 6.3 改点位

如果已经不是同一个固定监测点，不要直接改原 `stationCode` 硬顶过去。

应当：

- 新建正确的 `stationCode`
- 为新点位重新命名
- 重新注册设备归属
- 重新建立 baseline

## 7. 与后续部署的关系

服务器第一次正式部署之前，先让这条线通过。

也就是说，先把：

- 正式设备注册
- 正式命名
- baseline

处理清楚，再进入：

- `field-first-formal-deployment.md`

否则服务器侧即使部署成功，Desk 上的 GPS 分析和正式命名可见性也仍然会不稳定。

## 8. 当前项目里的单一事实来源

这条线的权威入口已经固定为：

- 运行手册：
  - `docs/guides/runbooks/field-formal-device-commissioning-runbook.md`
- 执行入口：
  - `scripts/dev/run-field-formal-device-commissioning.ps1`
- 正式注册脚本：
  - `scripts/dev/register-field-formal-devices.ps1`
- 命名标准：
  - `docs/guides/standards/field-device-identity-and-naming.md`
- baseline API：
  - `docs/integrations/api/08-gps-baselines.md`

以后讨论“设备注册、基线确立、给设备命名”这条线，统一回到这里，不再分散理解。
