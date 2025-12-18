# INC-0008 Fastify Hook 形参不匹配导致请求“卡死”

## 摘要

在 `fastify@5.x` 中，如果 Hook 使用了错误的函数签名（形参个数），Fastify 可能会把它当成 **callback 风格**（需要 `done()`）来执行；如果我们没有调用 `done()`，请求会一直处于挂起状态，表现为：

- TCP 能连上（`curl.exe` 显示 Connected）
- 但是 **一直收不到任何响应字节**，最终超时

这次问题导致 `api-service` 的 `GET /health` 在本机反复超时，阻塞了端到端验证。

## 影响范围

- 影响：所有经过该 Hook 的请求（包括 `/health`）
- 严重性：高（服务“看起来启动了”，但所有请求无响应）

## 现象与复现

- `api-service` 日志显示 “started”，端口 `LISTEN` 正常。
- 使用 `curl.exe -m 5 http://127.0.0.1:8080/health`：
  - 能连接
  - 5 秒后超时，0 bytes received

## 根因

Fastify 的 Hook 支持两种风格：

1. **Promise/async 风格**：`async (request, reply) => { ... }`
2. **Callback 风格**：`(request, reply, done) => { done() }`

当 Hook 使用了不符合预期的形参个数（例如 `(request) => {}` 或 `(request, reply) => {}` 但 Fastify 判定为 callback 风格）时，Fastify 可能会等待 `done()` 被调用；而我们的代码没有 `done()`，导致请求永远不结束。

## 修复方案

统一约束：**所有 Hook 一律使用 `async` 风格**（推荐），或显式使用 3 参并调用 `done()`。

推荐写法：

```ts
app.addHook("onRequest", async (request, reply) => {
  // do something
});
```

如必须 callback：

```ts
app.addHook("onRequest", (request, reply, done) => {
  done();
});
```

## 预防措施（必须执行）

- 在代码规范中明确：Fastify Hook 只能使用 `async (request, reply)` 或 `(request, reply, done)`。
- 加 lint 规则/代码审查项：禁止 `addHook("onRequest", (request) => ...)` 这类写法。
- 对自定义的 `request.xxx` 字段，必须配套 `decorateRequest()`（否则运行期可能抛错）。

## 关联改动

- `services/api/src/index.ts`：将 `onRequest`、`preHandler` Hook 改为 `async` 风格，避免请求挂起。

