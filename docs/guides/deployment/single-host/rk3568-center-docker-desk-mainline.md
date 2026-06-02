---
title: rk3568-center-docker-desk-mainline
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/deployment/single-host/rk3568-center-docker-desk-mainline
---

# RK3568 -> Docker Center -> Desk 正式主线

这份文档用于把当前阶段的正式主线固定成一条可部署、可交接、可验证的运行线，而不是继续把现场、中心、桌面端分散在多份报告里各自理解。

## 1. 当前主线边界

当前正式主线固定为：

- `RK2206 A/B/C -> center XL01 -> RK3568 /dev/ttyS3`
- `RK3568 -> EMQX -> Kafka -> Postgres / ClickHouse -> API -> Web`
- `desk-win` 通过统一 API 合同消费，不直连数据库

当前阶段的客户端交付口径同时冻结为：

- `desk-win` 是当前唯一正式交付客户端
- `Web` 当前保留在中心服务边界内，用于后续第二阶段适配，不作为本阶段对外正式交付入口
- 服务端仍以 `Docker Compose + API` 为底座，不能因为当前先交付 `desk-win` 就把服务边界做成 Windows 私有实现

当前阶段的目标不是再去证明“链路理论上能通”，而是把这条线收成：

- Docker 中心部署基线
- RK3568 北向绑定基线
- desk 交付与验收基线

## 2. 权威物料

中心部署与交接：

- `infra/compose/docker-compose.yml`
- `infra/compose/docker-compose.app.yml`
- `scripts/release/deploy-docker-oneclick.ps1`
- `docs/unified/reports/field-center-production-handoff-latest.json`

RK3568 北向绑定：

- `services/field-gateway/deploy/field-gateway.env.rk3568.example`
- `services/field-gateway/deploy/install-rk3568.sh`
- `scripts/dev/install-rk3568-field-gateway.ps1`
- `scripts/dev/check-field-center-rk3568-operator-entry.ps1`

软件与 desk 合同：

- `apps/web/lib/api/devices.ts`
- `services/api/src/routes/data.ts`
- `docs/unified/reports/field-center-deployment-software-adaptation-readiness-latest.json`
- `docs/unified/reports/desk-win-production-handoff-latest.json`

阶段汇总：

- `scripts/dev/render-field-rk3568-docker-center-desk-baseline.ps1`
- `docs/unified/reports/field-rk3568-docker-center-desk-baseline-latest.json`
- `docs/unified/reports/field-rk3568-docker-center-desk-baseline-latest.md`

## 3. 部署顺序

### 3.1 先起中心

从源码和 compose 起中心，不从 `artifacts/desk-win` 倒推后端：

```powershell
copy infra\compose\env.example infra\compose\.env
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release\deploy-docker-oneclick.ps1 -AllowUnsafeSecrets
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets
```

### 3.2 再绑定 RK3568

把 RK3568 的北向目标明确绑定到中心 Docker 线：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\install-rk3568-field-gateway.ps1 -Password <password> -OverwriteEnv
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-rk3568-operator-entry.ps1 -BoardPassword <password> -AllowUnsafeSecrets
```

默认冻结口径：

- 串口：`/dev/ttyS3`
- 波特率：`115200`
- field link mode：`cobs-crc-v1`
- northbound topics：
  - `telemetry/{device_id}`
  - `cmd/{device_id}`
  - `cmd_ack/{device_id}`

### 3.3 最后交付 desk

desk 只作为客户端交付路径，不反向定义服务端：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-desk-win-latest-delivery.ps1
```

当前交付策略：

- server/center：`Docker Compose`
- current client delivery：`desk-win`
- desk：`artifacts/desk-win/latest/` 或 `artifacts/desk-win/latest.zip`
- 安装器：按接收场景选择 Inno 或现有安装器验证通过的分发路径
- web：作为中心服务的一部分保留，但本阶段不作为唯一或主交付客户端

## 4. API/软件合同

当前桌面端和 Web 侧应共同依赖以下合同：

- `GET /api/v1/devices`
- `GET /api/v1/data/state/{deviceId}`
- `POST /api/v1/devices/{deviceId}/commands`

当前现场状态主读路径保持：

- `device_state`
- `14` 个 canonical metrics key

这意味着：

- desk 不应直接去读 `Postgres` 或 `ClickHouse`
- desk 只能请求 `API`，不能自己拼 SQL、不能绕过权限与审计、不能把数据库结构当成前端合同
- 数据库表结构后续可以演进，但只要 API 合同不破，`desk-win` 和后续 `Web` 都不需要跟着重写
- RK3568 输出字段要继续向现有软件合同靠拢
- Docker 中心改造时不能破坏上述三条 API 入口

## 5. 当前不做的事

- 不从 `artifacts/desk-win` 重建后端镜像
- 不把 `node C` 的板差问题升级成整条中心主线失败
- 不在当前阶段重开新的边缘协议层
- 不让桌面端绕开 API 直接访问数据库

## 6. 当前一句话结论

当前正式推进线已经固定为：

- `RK3568 -> Docker center -> API -> desk-win`

并且当前阶段的交付口径固定为：

- `desk-win` 是唯一正式交付客户端
- `Web` 留作后续成熟阶段复用同一套 API 的第二客户端

下一步应围绕这条主线做真实联调、Docker 化交接和服务器复用，而不是再回到旧的零散证明线。
