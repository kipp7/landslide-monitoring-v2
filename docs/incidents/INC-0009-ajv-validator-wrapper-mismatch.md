# INC-0009 AJV Validator 类型/运行时不一致导致 ingest 崩溃

## 摘要

`@lsmv2/validation` 中 `compileSchema()` 返回的是 AJV 的校验函数（function），但类型被错误地强转为自定义 `Validator<T>`（包含 `.validate()` 方法）。在 `ingest-service` / `telemetry-writer` 中调用 `validateX.validate(...)` 时触发运行时异常，导致 ingest 进程崩溃，端到端链路无法跑通。

## 影响范围

- `services/ingest`：在收到消息后，构造 DLQ 时直接崩溃（导致消息链路中断）
- `services/telemetry-writer`：同类用法会导致消费侧崩溃/不可用

## 现象

- `TypeError: validateDlq.validate is not a function`
- ingest 启动正常，但一旦收到 MQTT 消息就崩溃退出

## 根因

AJV 的 `compile()` 返回的是校验函数 `validateFn(value) => boolean`，并通过 `validateFn.errors` 暴露错误信息。

我们把函数强转为对象类型（含 `.validate`），导致 TypeScript 不报错，但运行期不存在 `.validate` 字段。

## 修复方案

在 `@lsmv2/validation` 中统一返回一个真正符合 `Validator<T>` 的 wrapper：

- `validate(value)`：内部调用 AJV `validateFn(value)`
- `errors`：通过 getter 读取 `validateFn.errors`

从而保持调用方代码不变，并让运行期行为与类型一致。

## 预防措施

- 类型不允许靠 `as unknown as` 强行“骗过”编译器；需要提供真实结构或改类型为 AJV 原生类型。
- 关键链路（ingest/writer）在冒烟测试中必须包含“收到一条消息”的用例，避免只验证启动不验证运行。

