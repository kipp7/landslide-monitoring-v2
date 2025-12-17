# tools/

本目录提供“契约优先”的**可执行校验脚本**，把文档要求落地为可检查项。

## validate-contracts

校验内容：

- OpenAPI YAML 可解析
- `integrations/api/*.md` 与 `integrations/api/openapi.yaml` 的端点覆盖一致
- MQTT/Kafka/Rules 的 JSON 示例可通过对应 JSON Schema 校验
- `integrations/contract-registry.md` 中引用的路径均存在

运行方式（在仓库根目录执行）：

- `python docs/tools/validate-contracts.py`

Windows（可选）：

- `powershell -ExecutionPolicy Bypass -File docs/tools/validate-contracts.ps1`

## scan-secrets

扫描内容（基础安全门禁）：

- 禁止提交真实密钥/Token/私钥片段
- 禁止提交真实 `.env` 文件（仅允许 `.env.example` / `.env.template`）

运行：

- `python docs/tools/scan-secrets.py`
- `powershell -ExecutionPolicy Bypass -File docs/tools/scan-secrets.ps1`

## run-quality-gates

一键运行常用门禁（建议在每次提交前执行）：

- `python docs/tools/run-quality-gates.py`
- `powershell -ExecutionPolicy Bypass -File docs/tools/run-quality-gates.ps1`

## OpenAPI codegen 占位门禁（重要）

当前仓库还未落地真实的 TS/Dart API Client 生成，但为了避免“OpenAPI 改了却没人更新下游”，我们先引入一个**可追踪的占位门禁**：

- `docs/integrations/api/openapi.sha256`

规则：

- 任何修改 `docs/integrations/api/openapi.yaml` 后，必须同步更新 `openapi.sha256`
- 更新命令：`python docs/tools/update-openapi-stamp.py`

该门禁会在 `run-quality-gates` 与 GitHub CI 中自动检查（未来接入真实 codegen 后，会用“生成后无 diff”替换此占位门禁）。

## GitHub CI（建议启用）

当仓库托管在 GitHub 时，建议开启 CI 把门禁变成“强制”：

- Workflow：`.github/workflows/quality-gates.yml`
- 依赖：`docs/tools/requirements.txt`

这样就算本地忘记跑脚本，PR 也会被拦住，避免把硬编码/契约不一致/密钥泄露带进主分支。
