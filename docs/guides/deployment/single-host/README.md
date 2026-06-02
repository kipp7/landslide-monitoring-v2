---
title: README
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/deployment/single-host/readme
---

# 单机部署（Docker Compose）

本目录作为“部署文档入口”；实际可运行的 Compose 物料统一放在仓库根目录的 `infra/compose/`，避免文档与配置分离导致漂移。

权威入口：

- `infra/compose/README.md`
- `infra/compose/docker-compose.yml`
- `infra/compose/env.example`

运行手册见：

- `docs/guides/runbooks/single-host-runbook.md`

阶段 1（设备鉴权/ACL）接线说明：

- `docs/guides/deployment/single-host/emqx-http-auth.md`

JWT/RBAC（Web 登录）Bootstrap（非硬件模块，推荐优先收口）：

- `docs/guides/deployment/single-host/jwt-rbac-bootstrap.md`

腾讯云轻量服务器云端后端中心平台部署：

- `docs/guides/deployment/single-host/tencent-cloud-lightweight-backend.md`
