---
title: lock-softcom-competition-naming-and-ai-expression-strategy
type: note
tags:
- decision
status: active
permalink: landslide-monitoring-v2-mainline/memory/decisions/lock-softcom-competition-naming-and-ai-expression-strategy
---

# Decision: lock-softcom-competition-naming-and-ai-expression-strategy

## Context

The 2026 competition materials for this project went through multiple rounds of wording changes around:

- whether to foreground `AI`
- whether to foreground `智能预测预警` or `位移预测预警`
- how to describe the RK3568 edge layer without sounding hollow
- how to align the work with the competition slogan:
  - `AI for Design & Design for AI`

Without a durable decision note, later sessions would likely reopen the same wording debate.

## Decision

For competition-facing materials, lock the current strategy as:

- prefer the more technically focused final title:
  - `基于TX-SMART-R的山体滑坡位移预测预警与区域自适应多模态智防系统`
- keep the title professional and avoid explicit `AI驱动` / `人工智能驱动`
- make `AI` visible in the intro and conclusion rather than overloading the title
- align the writeup to both:
  - `AI for Design`
  - `Design for AI`
- describe the edge-side capability as:
  - `轻量化数据链健康模型`
  rather than using product-specific branding
- if edge architecture wording is needed, keep it at the architecture layer:
  - `self-hosted gateway`
  - `agent-native runtime`
  and translate the rest into project-grounded wording:
  - `多节点任务路由`
  - `状态记忆`
  - `健康摘要生成`
  - `本地快速响应`

The recommended domain-realistic pain framing is:

- event samples are scarce, data sources are fragmented, and labels are insufficient
- regional triggering mechanisms and evolution patterns differ significantly, making model/threshold reuse difficult
- multi-source monitoring data is hard to turn into a unified judgment
- displacement trends and risk levels are hard to identify early, and field-link stability plus data credibility are hard to sustain

## Rationale

- `位移预测预警` is more specific and technically stronger than a broad `智能预测预警` label.
- Explicit `AI驱动` in the title feels more slogan-like and risks sounding hollow.
- The project already has enough real AI content in:
  - displacement prediction
  - warning classification
  - YOLO visual evidence
  - edge data-link health modeling
- The competition slogan rewards clear dual-direction alignment, but the best way to show that is through the body narrative, not by stuffing the title with AI buzzwords.
- `OpenClaw`-style product naming in formal materials creates unnecessary review risk; architecture-level wording is safer.

## Consequences

- Future competition drafts should default to the locked title and expression strategy instead of reopening naming debates.
- If a shorter or more AI-forward version is needed later, it should be treated as a derived variant for PPT or cover usage, not as the baseline formal name.
- The edge-side paragraph should stay grounded in currently plausible RK3568 capabilities and avoid overstating a generic multi-agent platform.

## Follow-up

- keep all future 150-word / 300-word / PPT variants aligned with this decision
- if the formal title is switched in docs, sync the competition hub and any PPT source text to match
- preserve the user-provided original long-form intro in:
  - `memory/references/softcom-original-long-form-work-intro.md`
