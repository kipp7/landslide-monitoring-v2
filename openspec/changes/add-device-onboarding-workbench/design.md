---
title: design
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-device-onboarding-workbench/design
---

## Context

项目当前已经同时存在三条真实约束：

1. 产品入口约束
- desk 当前主导航已经固定为：
  - 首页
  - 数据分析
  - 设备管理
  - 地质形变监测
  - 系统监控
  - 系统设置
- 当前不适合再加新的左侧一级导航项

2. 现场身份主线约束
- 现场 RK3568 代管路径当前采用 `gateway_preprovisioned`
- 正式设备不是“首启自注册”
- 当前真实闭环是：
  - 平台预建台账
  - RK3568 固化 southbound 映射
  - 节点按既定 `device_id` 上送
  - 平台完成命名和投运验证

3. 当前 desk 页面复杂度约束
- `DeviceManagementPage` 已同时承担：
  - 设备状态
  - 监测站管理
  - 基线管理
  - 设备控制
  - 实时数据和详情
- 如果继续把接入/注册/投运塞进现页，会让交互、状态和代码结构进一步恶化

## Goals / Non-Goals

- Goals:
  - 把当前脚本化的正式接入主线产品化为 desk 端连续流程
  - 保持“设备管理”作为统一入口，不新增左侧一级模块
  - 给操作员一个清晰的待接入、绑定、投运、审计工作台
  - 强约束 UI 复用现有组件、现有暗色配色和交互风格
  - 保持 `API-only` 边界
- Non-Goals:
  - 不重做整个 desk 导航结构
  - 不在本轮支持设备自助 claim / register
  - 不在本轮引入新的视觉系统或完全独立设计语言
  - 不在本轮实现批量区域导入、二维码发放和证书体系

## Decisions

### Decision: Place onboarding under device management, not as a new top-level module

“设备接入与投运中心” SHALL live under `设备管理`。

Recommended route:

- `/app/device-management/onboarding`

This keeps product IA stable:

- operations still know “anything device-related lives in 设备管理”
- code can split onboarding into a dedicated page instead of growing the current monolith

### Decision: Separate discovery from formal registration

The system SHALL treat uploaded device data as a discovery signal, not as automatic formal registration.

Implications:

- unknown or unbound device observations go to a pending queue
- operators may review evidence before binding
- only an explicit bind action creates or activates formal registry truth

### Decision: Preserve `gateway_preprovisioned` for the RK3568-managed field path

For the current landslide field topology:

- onboarding UI SHALL assist pre-provisioned registration and commissioning
- it SHALL NOT implement “node first-boot self-claim”

Product meaning:

- the page is an operator workbench
- not a device-driven enrollment handshake

### Decision: Use an explicit lifecycle state model for onboarding

The onboarding workbench SHALL expose distinct operational states:

- `observed`
- `pending_binding`
- `bound`
- `pending_commissioning`
- `commissioned`
- `replaced`
- `revoked`

Rationale:

- operators need to distinguish “I have seen this device” from “this device is already formal”
- future batch onboarding and board replacement depend on explicit transitions

### Decision: The first version should be a four-zone workbench

The page IA SHALL be split into four zones:

1. `待接入设备`
- recent unknown or not-yet-formal observations
- identity evidence, gateway source, firstSeen, lastSeen, sample telemetry

2. `绑定与命名`
- bind to an existing station or create a formal point
- edit canonical identity fields and display labels

3. `投运验证`
- telemetry freshness
- latest state snapshot
- command/ACK closure
- GPS baseline readiness
- operator-ready pass/fail summary

4. `审计记录`
- who bound what
- when naming changed
- whether the device was replaced or revoked

### Decision: Reuse the current design system and component vocabulary

The onboarding workbench SHALL reuse existing desk visual patterns:

- `BaseCard`
- Ant Design `Table`, `Form`, `Drawer`, `Tag`, `Steps`, `Descriptions`, `Alert`
- existing dark theme spacing, borders, tags and status colors

It SHALL NOT introduce:

- a new top-level color palette
- a separate product theme
- a radically different navigation model

### Decision: Prefer a dedicated subpage over adding another query-tab into the current page

The first implementation SHOULD be a dedicated page component, not another tab inside `DeviceManagementPage`.

Reason:

- the current page already mixes too many responsibilities
- a dedicated page reduces regression risk
- sub-routing is easier to maintain and easier to test

### Decision: Keep the backend boundary API-only

The desk client SHALL consume onboarding data and actions through API endpoints only.

The client SHALL NOT:

- query Postgres directly
- infer formal truth only from local UI state
- mutate registry state without audited API actions

## Recommended Information Architecture

### Entry

- Left nav stays unchanged
- `设备管理` page gains a clear secondary entry:
  - `设备状态`
  - `监测站管理`
  - `基线管理`
  - `设备接入与投运`

### Page layout

- Top summary strip
  - pending count
  - bound-but-not-commissioned count
  - commissioned today
  - replacement / revoked alerts
- Main left pane: pending device queue
- Main center pane: binding and naming form
- Main right pane: commissioning evidence
- Bottom full-width pane: audit history

### Progressive actions

The primary CTA sequence SHOULD be:

- `认领为正式设备`
- `绑定并保存`
- `执行投运检查`
- `确认投运`

## API Boundary (Conceptual)

The first implementation SHOULD introduce or expose APIs that cover:

- list pending observations
- get pending observation detail
- bind observation to formal station/device identity
- create formal station during binding when needed
- get commissioning checklist/evidence
- confirm commissioning
- list onboarding audit records

The first version MAY read from existing registry and state tables, but the operator-facing flow MUST be expressed through onboarding-specific API contracts.

## Risks / Trade-offs

- If the workbench is built as just another giant tab inside `DeviceManagementPage`, maintainability will keep degrading
- If unknown devices are auto-promoted to formal, future batch rollout will pollute production views
- If the state model is not explicit, replacement, re-binding and commissioning history will become ambiguous

## Rollout Plan

### Phase 1: Product shape and read path

- define route, IA, state model, and read APIs
- show pending observations and formal bind targets

### Phase 2: Binding and naming actions

- bind devices to formal registry
- support create-new-station during bind
- write audited events

### Phase 3: Commissioning checks

- show telemetry freshness, command ACK proof and baseline readiness
- allow confirm commissioning

### Phase 4: Scale features

- batch onboarding
- import templates
- device replacement assistant
- later burn-package / QR integrations

## Open Questions

- whether onboarding audit should be a dedicated table or built from operation logs plus typed metadata
- whether pending observations should be backed by a dedicated table or derived from existing runtime observations in the first version
- whether “new station creation” should be inline in v1 or gated behind an admin-only drawer
