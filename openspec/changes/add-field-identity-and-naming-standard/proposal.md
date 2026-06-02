---
title: proposal
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-field-identity-and-naming-standard/proposal
---

## Why

当前仓库已经冻结了 `device_id(UUID)` 作为机器主身份，也已经证明 `API -> MQTT/Kafka -> ingest/writer -> API/Web/Desk` 主链可以工作。但现场侧还缺一份更高层的“业务身份与命名标准”：

- 现场人员需要按区域、滑坡体、固定点位、节点角色管理设备
- 平台需要支持未来一个区域一个区域地大规模接入
- 当前历史兼容对象、seed、replay、rehearsal、smoke_test 已经证明：如果没有正式分层规则，正式视图会被测试设备污染
- 若继续把 `device_name`、`install_label`、`legacy_device_id`、`device_1..6` 混用，后续换板、返修、扩区、批量导入都会出现身份漂移

本变更的目标不是立刻重构所有接口和数据库，而是先冻结一套“现场身份与命名标准”，为后续 API、数据库、前端和部署治理提供统一真值。

## What Changes

- 新增现场业务身份层级标准：
  - `region_code`
  - `slope_code`
  - `station_code`
  - `node_code`
  - `gateway_code`
- 明确 `device_id` 继续作为唯一机器身份，不能被 `device_name` 或 `install_label` 替代
- 明确“固定点位”和“具体硬件生命周期”必须分离
- 新增 `identity_class` 规则，正式区分：
  - `formal`
  - `seed`
  - `replay`
  - `rehearsal`
  - `smoke_test`
  - `lab`
- 定义大规模接入时的最小字段集和命名模板
- 规定当前阶段先通过 `stations.metadata / devices.metadata` 落地，不强制立即做数据库破坏式升级
- 定义兼容迁移路径：旧 `device_1..N` / `legacy_device_id` 继续兼容，但不再作为正式交付命名标准

## Impact

- Affected specs:
  - `field-device-identity`（新增）
- Affected docs:
  - `docs/guides/standards/field-device-identity-and-naming.md`
  - `docs/guides/standards/naming-conventions.md`
- Affected code (future work, not in this proposal):
  - `services/api` 设备与站点读写口径
  - `apps/web` / `apps/desk` 正式设备视图筛选
  - 设备注册、批量导入、正式/测试设备分层逻辑

## Non-Goals

- 本变更不立即修改数据库 schema
- 本变更不立即把 `region/slope/node/gateway` 全部升成一等表
- 本变更不立即重写所有 legacy 兼容页
- 本变更不立即移除 `device_1..N` 兼容数据
- 本变更不替换现有 `device_id(UUID)` 机器身份机制
