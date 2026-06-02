---
title: field-first-formal-deployment
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/deployment/single-host/field-first-formal-deployment
---

# 现场产品第一次正式部署

这份手册只回答一件事：当前这套系统第一次正式上服务器时，应该按什么顺序执行，哪些结果算通过，哪些问题不应再误判为“整条主线失败”。

## 1. 部署目标

第一次正式部署的目标固定为：

- 把中心侧以 `Docker Compose` 方式部署到服务器
- 让 RK3568 继续按既定 northbound 契约接入中心
- 保持产品主读路径为：
  - `Postgres device_state`
  - `ClickHouse telemetry_raw`
  - `API/Web`
  - `desk-win` 交付包

当前不是要在服务器上重做架构，而是把已经在本地收口的主线复跑到服务器。

## 2. 当前准入标准

第一次正式部署前，至少满足：

1. 现场正式设备投运线为绿：
- `docs/guides/runbooks/field-formal-device-commissioning-runbook.md`
- `docs/unified/reports/field-formal-device-commissioning-latest.json`

2. 中心部署交接包为绿：
- `docs/unified/reports/field-center-production-handoff-latest.json`

3. DB/API 活链达到运营就绪：
- `docs/unified/reports/field-center-db-api-live-proof-latest.json`
- 允许：
  - `accepted=false`
  - 但必须 `operationallyReady=true`

4. 平台级轻量验收为绿：
- `scripts/dev/check-field-platform-acceptance.ps1`

5. desk 交付包为绿：
- `docs/unified/reports/desk-win-latest-delivery-latest.json`

6. RK3568 当前真实口径固定为：
- `A=online`
- `B=online`
- `C=configured|deferred`

`node C` 当前可继续作为挂起节点，不应阻塞第一次正式部署。

## 3. 标准执行顺序

### 3.1 部署前复核

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\prepare-field-first-formal-deployment.ps1 -AllowUnsafeSecrets
```

这条入口会统一刷新：

- center production handoff
- DB/API live proof
- desk latest delivery
- platform acceptance
- RK3568 production uplink latest facts

### 3.2 服务器侧环境准备

```powershell
copy infra\compose\env.prod.example infra\compose\.env
notepad infra\compose\.env
```

至少替换：

- `PG_PASSWORD`
- `CH_PASSWORD`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `ADMIN_API_TOKEN`
- `CORS_ORIGINS`

### 3.3 先做 validate

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets
```

这一步通过后，说明：

- compose 边界正确
- env 没有缺失/占位符
- 一键部署入口与当前主线一致

### 3.4 再做 apply

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode apply -AllowUnsafeSecrets
```

### 3.5 服务器部署后复核 RK3568

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-center-operational-recovery.ps1 -BoardPassword <password> -AllowUnsafeSecrets
```

## 4. 服务器部署成功的判断标准

服务器第一次正式部署完成后，至少看到：

1. center compose 为绿
2. `EMQX -> Kafka -> Postgres/ClickHouse -> API/Web` 为绿
3. RK3568 仍能 northbound 连到中心
4. `A/B` 继续保持在线
5. `node C` 若仍为 deferred，不视为服务器部署失败

## 5. 当前不作为阻塞项

- `node C` 单板恢复
- replay/historical devices 的展示治理
- 更复杂的服务器高可用
- 多节点弹性伸缩

## 6. 当前一句话结论

第一次正式部署应按这条线执行：

- `prepare-field-first-formal-deployment.ps1`
- `check-field-center-compose-acceptance.ps1 -DeployMode validate`
- `check-field-center-compose-acceptance.ps1 -DeployMode apply`
- `check-field-rk3568-center-operational-recovery.ps1`

只要 `A/B online`、center green、desk delivery green，就可以把这次部署视为第一次正式部署完成，而不是继续被 `node C` 卡住。
