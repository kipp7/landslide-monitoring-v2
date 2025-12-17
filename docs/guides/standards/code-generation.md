# 代码生成（Codegen）规范（必须遵守）

目标：让“契约优先”可落地、可复用、可长期维护——通过代码生成把 DTO/Client 的一致性变成工具保证，而不是靠人肉同步。

## 1) 权威来源（Single Source of Truth）

- HTTP API：`docs/integrations/api/openapi.yaml`
- MQTT/Kafka/Rules：对应 `docs/integrations/*/schemas/*.json`（以及 `examples/`）

任何字段、枚举、路径、响应结构的变更，必须先改契约，再触发 codegen 更新下游代码。

## 2) 生成产物与边界（禁止手改）

建议统一存放到仓库内固定目录（实现阶段落地）：

- Web（TypeScript）：
  - 生成 DTO 类型：`apps/web/src/generated/api-types/`
  - 生成 API Client：`apps/web/src/generated/api-client/`
- Backend（TypeScript）：
  - 生成 DTO 类型：`services/api/src/generated/api-types/`
  - （可选）生成 request/response 校验器（用于 runtime 验证）
- Flutter（Dart）：
  - 生成 API Client：`apps/mobile/lib/generated/api/`

规则：

- `generated/` 目录内代码**禁止手改**（统一由脚本生成）
- 自定义逻辑必须写在 `wrappers/` 或 `adapters/` 中，通过组合/封装使用 generated
- `generated/` 代码应有 “DO NOT EDIT” 头（生成器默认或脚本插入）

## 3) 推荐工具（可替换，但必须固定）

> 工具不要求现在就安装；但一旦选型确定，就写入 ADR 并在 CI 固化。

### TypeScript（Web/Backend）

可选路线（推荐其中一种，避免混用）：

1. `openapi-typescript`：生成 TypeScript 类型（轻量、学习成本低）
2. `openapi-generator`：生成更完整 client（但依赖较重）
3. `orval`：生成 hooks/client（适合前端，但对项目形态有要求）

### Dart（Flutter）

建议路线：

- `openapi-generator` 的 `dart-dio`（与我们 `dio` 技术栈一致）

约束：

- 生成的 Dart client 必须以 `dio` 为底层，不允许每个模块手写一套请求逻辑
- 错误处理与 traceId 输出必须统一（见 `docs/guides/standards/api-contract-rules.md`）

## 4) 运行时校验（强烈建议）

仅靠类型生成无法防止“运行时错误输入”，因此必须在边界层增加 runtime 校验：

- API（HTTP）：对 body/query/path 做校验（可以由 OpenAPI 派生或手写 schema）
- MQTT/Kafka：对消息 payload 做 JSON Schema 校验

规则：

- 校验失败必须进入 DLQ 或返回结构化错误，并携带 `traceId`

## 5) CI/门禁（实现阶段必须启用）

当代码生成落地后，CI 至少要做到以下之一：

- **方式 A（推荐）**：提交时包含 generated 代码，CI 校验“生成后无 diff”
- **方式 B**：不提交 generated，CI 在构建时生成（但本地与 CI 必须一致，且调试成本更高）

无论哪种方式，必须满足：

- 任意 PR 修改 `openapi.yaml` 后，相关 generated 产物必须同步更新，否则 CI 失败

## 6) 与当前仓库门禁的关系

当前已落地门禁（不依赖 Node/Flutter 环境）：

- `python docs/tools/run-quality-gates.py`（契约一致性 + secrets 扫描）

并且已增加一个“OpenAPI codegen 占位门禁”（用于约束 OpenAPI 变更纪律）：

- `docs/integrations/api/openapi.sha256` 必须与 `openapi.yaml` 内容一致
- 更新命令：`python docs/tools/update-openapi-stamp.py`

后续引入真实 codegen 后，应把占位门禁替换为 “生成后无 diff” 检查，仍保持“一键可跑”。
