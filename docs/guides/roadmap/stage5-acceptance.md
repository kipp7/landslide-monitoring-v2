# Stage 5 — Acceptance (单片机端适配 / 固件侧对齐)

目标：在保持 Stage2 回归基线可复现的前提下，引入“固件侧行为参考（模拟器）”，实现 MQTT 对齐、断电安全与最小命令集，并接入单机 e2e evidence bundle。

## 范围

- MQTT Topic / Payload 对齐：见 `docs/integrations/mqtt/mqtt-topics-and-envelope.md` + schemas
- 固件模拟器：`scripts/dev/firmware-sim.js`
- e2e 预置：`infra/compose/scripts/e2e-smoke-test.ps1 -Stage5Regression`

## 验收标准（必须满足）

1) **Schema 对齐**
- TelemetryEnvelope / DeviceCommand / DeviceCommandAck 发送与接收均通过 JSON Schema 校验

2) **断电安全与重连策略**
- 模拟器持久化 `seq` 与 `set_config` 配置到 state 文件（原子写）
- 连接断开后按指数退避 + jitter 重连，避免“重连风暴”

3) **最小命令集**
- `ping` / `set_config` / `reboot` 三类命令可走完整闭环：API 创建 → MQTT 下发 → 设备回执（acked/failed）→ API 可查询状态与 result

4) **单机 e2e 可复现**
- `infra/compose/scripts/e2e-smoke-test.ps1 -Stage5Regression` 一键可跑通，并在 evidence bundle 中包含固件模拟器 stdout/stderr + state 文件

## 验证方式（本地）

```powershell
python docs/tools/run-quality-gates.py
npm run lint
npm run build

powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1 -Stage5Regression
```

已验证（本地）：2025-12-28 已跑通 `-Stage5Regression`（含固件模拟器 + `ping`/`set_config`/`reboot` 命令闭环）。

备注：`backups/` 已被 `.gitignore` 忽略；e2e evidence bundle 不要提交。
