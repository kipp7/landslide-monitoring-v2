# integrations/

该目录是所有“对接契约”的唯一来源，避免全局搜索与多份文档不一致。

子目录：

- API：`docs/integrations/api/README.md`
- MQTT：`docs/integrations/mqtt/README.md`
- Firmware（单片机适配）：`docs/integrations/firmware/README.md`
- Kafka：`docs/integrations/kafka/README.md`
- Rules：`docs/integrations/rules/README.md`
- Storage：`docs/integrations/storage/README.md`
- AI（预测/专家系统）：`docs/integrations/ai/README.md`
- IoT adapters（HTTP Push / 第三方平台接入）：`docs/integrations/iot/README.md`

机器可读契约入口（实现阶段逐步启用）：

- OpenAPI：`docs/integrations/api/openapi.yaml`
- Rule DSL Schema：`docs/integrations/rules/rule-dsl.schema.json`
- MQTT/Kafka Schema：见 `docs/integrations/contract-registry.md`
- 契约完整性清单：`docs/integrations/contracts-checklist.md`
- 契约注册表：`docs/integrations/contract-registry.md`
- 契约校验脚本：`docs/tools/validate-contracts.py`
