---
title: proposal
type: note
permalink: landslide-monitoring-v2-mainline/openspec/changes/add-device-onboarding-workbench/proposal
---

## Why

当前“正式设备注册 / 正式命名 / 投运验证”已经有真实主线，但仍然主要依赖脚本和 runbook：

- `scripts/dev/register-field-formal-devices.ps1`
- `scripts/dev/run-field-formal-device-commissioning.ps1`
- `docs/guides/runbooks/field-formal-device-commissioning-runbook.md`

这在 3 台设备联调阶段可用，但在后续“一个区域一个区域接入、设备量持续扩大”的场景下会出现明显问题：

- 操作员无法在 desk 端看到“待接入设备 -> 正式绑定 -> 投运确认”的连续流程
- 新设备是否“已注册 / 未绑定 / 未投运”只能靠脚本和人工记忆判断
- 设备发现、正式命名、基线 readiness、命令闭环证据分散在不同页面与脚本中
- 继续把这条能力塞进现有 `DeviceManagementPage` 会让页面进一步失控

因此需要把现有脚本化主线产品化为一个可交付的“设备接入与投运中心”。

## What Changes

- 新增 `device-onboarding-workbench` 能力规范
- 定义该能力在 desk 中的产品位置：
  - 作为“设备管理”下的独立子页
  - 不新增左侧一级菜单
  - 推荐路由：`/app/device-management/onboarding`
- 定义一条连续的产品流程：
  - 待接入发现
  - 正式绑定与命名
  - 投运验证
  - 审计留痕
- 定义设备接入状态流转：
  - `observed`
  - `pending_binding`
  - `bound`
  - `pending_commissioning`
  - `commissioned`
  - `replaced`
  - `revoked`
- 明确当前现场主线仍然采用 `gateway_preprovisioned`
  - 不是“设备首启自注册”
  - 未知设备上报只能进入待接入队列，不能自动晋升为正式设备
- 明确 UI 复用边界：
  - 复用现有 `apps/desk` 组件、暗色主题、表格/卡片/标签风格
  - 不引入新的顶级视觉语言

## Impact

- Affected specs:
  - `device-onboarding-workbench`（新增）
- Affected code:
  - `apps/desk/src/routes/AppRoutes.tsx`
  - `apps/desk/src/views/DeviceManagementPage.tsx`
  - `apps/desk/src/views/` 下新增 onboarding 子页与相关复用组件
  - `services/api/src/routes/` 下新增或扩展 onboarding / binding / commissioning 读写接口
- Affected docs:
  - `docs/features/prd/device-onboarding.md`
  - `docs/guides/runbooks/field-formal-device-commissioning-runbook.md`
  - `docs/guides/roadmap/project-status.md`

## Non-Goals

- 本变更不把“设备接入与投运中心”做成左侧新的一级模块
- 本变更不改当前 `gateway_preprovisioned` 主线为“设备首启自注册”
- 本变更不允许未知设备一上报就自动写入正式台账
- 本变更不让 desk 直接操作数据库，仍然必须走 API
- 本变更不在本轮实现烧录包二维码、secret 在线轮换或 mTLS 体系
