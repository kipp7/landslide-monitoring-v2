# gnss-demo-data-fix

## Status

- task: `gnss-demo-data-fix`
- state: `completed`
- updated_at: `2026-03-14`

## Scope

本任务只处理 **GNSS / 站点 demo 数据质量问题**，不扩展到 Desk 页面改造、平台 API 契约扩展或 OpenHarmony 资料补齐。

## Evidence Carrier Correction

- 之前主线误判的根因是：
  - 有效证据最初承载在 worktree 的 `gnss-protocol` report + journal
  - 主线 `gnss-demo-data-fix.md` 没有及时同步
- 当前主线已经完成收口，同步后的本文件就是当前真值入口

## Completed Fixes

### 1. 中文 seed 编码异常

- 已修复
- 当前 `/api/v1/stations` 返回：
  - `stationName = 示例监测点A`
  - `metadata.locationName = 示例监测区A`

### 2. 孤立设备缺少 `stationId/stationName`

- 已修复
- 当前 `/api/v1/devices` 只剩 3 个正式 demo 设备
- 先前残留的 `smoke-device` 已清理

### 3. DEMO001 站点元数据不完整

- 已修复
- 当前已补：
  - `locationName`
  - `riskLevel`
  - `risk_level`

### 4. baseline demo 字段覆盖不完整

- 已修复
- 当前 `/api/v1/gps/baselines/{deviceId}` 已返回：
  - `positionAccuracyMeters`
  - `satelliteCount`

### 5. 遥测 demo 未覆盖 `gps_altitude`

- 已修复
- 当前 seed 已补 `gps_altitude`

## Current Judgment

- 按本任务“demo 数据质量修复”的范围判断，当前轮目标已经完成
- 剩余问题如：
  - OpenHarmony 资料源缺失
  - compat alias 收敛需要进入实现修改
  不再属于本子任务的当前收口目标

## Next Step

- 本任务当前轮已收口完成
- 若后续继续 GNSS 线，应另起目标，处理：
  - OpenHarmony 资料源
  - compat alias 收敛
