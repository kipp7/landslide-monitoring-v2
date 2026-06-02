---
title: tasks
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-system-resources-interface/tasks
---

## 1. Contract

- [ ] 1.1 定义 `SystemResourceStatus` 接口模型
- [ ] 1.2 更新 API 文档，明确健康摘要模型与资源占用模型分离
- [ ] 1.3 为新接口补 OpenAPI delta

## 2. Backend

- [ ] 2.1 在 `services/api` 新增 `/api/v1/system/resources`
- [ ] 2.2 返回 CPU / 内存 / 磁盘的真实资源占用数据
- [ ] 2.3 保持 `/api/v1/system/status` 现状不变

## 3. Verification

- [ ] 3.1 新接口最小健康验证
- [ ] 3.2 文档与返回字段一致性验证