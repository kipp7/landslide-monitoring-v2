---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-field-identity-and-naming-standard/design
---

## Context

当前项目已经有两类“身份”同时存在：

- 平台机器身份
  - `device_id`
  - `station_id`
  - `command_id`
- 现场/兼容/展示身份
  - `device_name`
  - `legacy_device_id`
  - `install_label`
  - `chart_legend_name`
  - `station_name`

这在小规模联调时还能工作，但在未来“一个区域一个区域接入、设备量很大”的场景下会失控：

- 现场固定点位与具体板卡生命周期会混在一起
- 换板后历史数据难以连续归档
- replay / rehearsal / seed 设备会持续污染正式产品视图
- 网关、分节点、中心节点的角色边界不清晰

## Goals / Non-Goals

- Goals:
  - 冻结一套适合山体滑坡场景的业务身份层级
  - 保护现有 `device_id(UUID)` 主链不被推翻
  - 为后续正式设备视图治理、批量导入、区域扩容提供统一真值
  - 明确正式设备与测试设备分层
- Non-Goals:
  - 不在本轮直接做破坏式 schema 迁移
  - 不在本轮直接改所有页面和接口
  - 不在本轮直接废除兼容数据

## Existing Truth We Must Preserve

### Platform truth

- `device_id(UUID)` 是唯一机器身份
- `/api/v1/devices/{deviceId}/commands` 继续是正式命令入口
- 遥测消息、命令、回执继续围绕 `device_id`

### Field truth

- 现场实际需要按区域、滑坡体、点位、节点角色来管理
- 一个固定点位上可能发生换板、返修、升级
- 一个网关会服务多个分节点

### Runtime truth

- 当前仓库已经存在 `seed/replay/rehearsal/smoke_test` 这类非正式设备
- 如果不分层，正式产品视图会被污染

## Decisions

### Decision: Keep `device_id` as the only machine identity

`device_id` SHALL remain the only platform machine identity.

It MUST continue to be used for:

- authentication
- MQTT topics
- command targeting
- database primary identity
- audit and alert correlation

### Decision: Introduce a business hierarchy above `device_id`

The field business hierarchy SHALL be:

1. `region_code`
2. `slope_code`
3. `station_code`
4. `node_code`
5. `gateway_code`

Interpretation:

- `region` is a deployment or operations partition
- `slope` is a landslide body or monitored risk body
- `station` is the fixed monitoring point
- `node` is the logical node role under a point
- `gateway` is the edge aggregation unit

### Decision: Fixed monitoring points must survive hardware replacement

`station_code` and `node_code` SHALL represent long-lived business continuity.

When a board is replaced:

- `device_id` MAY change
- `station_code` MUST remain stable
- `node_code` SHOULD remain stable unless the physical role itself changes

### Decision: The current `station` entity maps to a fixed monitoring point

During the near-term rollout, the repository's existing `station` entity SHALL be interpreted as the fixed monitoring point, not as the entire landslide body.

Implications:

- `station_code` represents the fixed point code
- `slope_code` remains a higher-level business grouping
- `region_code` remains a deployment partition
- `slope` and `region` MAY stay in metadata during the first rollout stage

### Decision: Human-readable labels must not compete with machine identity

The system MAY expose:

- `display_name`
- `install_label`
- compatibility `device_name`

But these fields MUST NOT replace `device_id`.

### Decision: Product truth requires an explicit identity class

Each device SHALL have an `identity_class`.

Recommended values:

- `formal`
- `seed`
- `replay`
- `rehearsal`
- `smoke_test`
- `lab`

Product default views SHALL only expose `formal` devices unless an explicit debug/admin path requests otherwise.

### Decision: Near-term rollout should use metadata, not a forced schema rewrite

Because the repository still uses `devices` and `stations` as the dominant entities, the first rollout SHOULD land the new hierarchy through metadata:

- `stations.metadata.regionCode`
- `stations.metadata.slopeCode`
- `devices.metadata.nodeCode`
- `devices.metadata.gatewayCode`
- `devices.metadata.deviceRole`
- `devices.metadata.identityClass`
- `devices.metadata.displayName`

Later, if scale or query pressure requires it, selected fields MAY be promoted to first-class indexed columns.

### Decision: Pre-scale rollout requires searchable canonical identity fields

Before large-scale regional onboarding, product and operations read paths SHOULD support stable filtering by:

- `identity_class`
- `region_code`
- `slope_code`
- `station_code`
- `node_code`
- `gateway_code`
- `device_role`

These fields MAY start in metadata, but their keys and semantics MUST be frozen before import tooling or bulk onboarding is introduced.

## Recommended Code Templates

### `region_code`

- `<COUNTRY>-<PROVINCE>-<CITY>-<AREA>`
- example: `CN-GX-YL-DC`

### `slope_code`

- `LS-<region_code>-<seq3>`
- example: `LS-CN-GX-YL-DC-001`

### `station_code`

- `ST-<slope_code>-<seq2>`
- example: `ST-LS-CN-GX-YL-DC-001-01`

### `node_code`

- `ND-<station_code>-<node_suffix>`
- example: `ND-ST-LS-CN-GX-YL-DC-001-01-A`

### `gateway_code`

- `GW-<region_code>-<seq2>`
- example: `GW-CN-GX-YL-DC-01`

## Alternatives Considered

### Alternative A: Put all business meaning into `device_id`

Rejected.

Reason:

- replacement and repair would destroy business continuity
- machine identity and business location would become inseparable

### Alternative B: Keep using `device_name` / `device_1..N` as the effective business key

Rejected.

Reason:

- not scalable across regions
- not stable enough for large-scale operations
- already proved fragile in product views

### Alternative C: Immediately migrate to a fully normalized region/slope/station/node relational model

Deferred.

Reason:

- directionally correct
- but too invasive for the current phase
- the project needs a naming truth first, then controlled rollout

## Risks / Trade-offs

- If metadata is used too long without promotion, search and filtering may become awkward
- If naming rules are too loose, different deployment teams will drift
- If compatibility data stays unclassified, product views will continue to be polluted

## Rollout Plan

### Phase 1: Freeze naming and identity truth

- freeze the hierarchy and field semantics
- freeze identity class rules
- freeze display-vs-machine separation

### Phase 2: Apply product-view filtering

- formal product views show only `identity_class=formal`
- test and evidence devices stay available only in debug paths

### Phase 3: Align A/B/C real nodes

- assign canonical region/slope/station/node/gateway metadata
- keep legacy compatibility fields only as read-side compatibility

### Phase 4: Multi-region onboarding

- add bulk registration/import tools
- add region/slope/station-based querying and indexing

## Open Questions

- whether `slope` should later become a first-class table
- which metadata fields need early indexes before large-scale rollout
- whether `gateway_code` should attach to a slope-level coverage cell or a region-level operations cell in the first field deployment
