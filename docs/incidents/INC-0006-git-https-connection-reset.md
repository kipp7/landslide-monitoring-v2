# INC-0006: Git 命令行访问 GitHub 连接重置/超时（影响 fetch/pull/push）

## Summary

在 Windows + PowerShell 环境下，出现 Git 命令行访问 GitHub 不稳定的问题：

- `git fetch/pull/push` 报错：`Recv failure: Connection was reset`
- `curl https://github.com/` 超时

但浏览器访问 GitHub 与 GitHub Actions 页面仍可能正常。

## Impact

- 无法在命令行稳定执行 `fetch/pull/push`，影响创建/更新 PR 的自动化流程。
- 合并冲突处理、分支同步变得困难，容易形成“本地落后于 main”的状态。

## Evidence（示例）

- `fatal: unable to access 'https://github.com/...': Recv failure: Connection was reset`
- `curl.exe -I https://github.com/` 超时

## Possible Causes（非唯一）

- 校园网/代理/防火墙对 GitHub 的 TLS/HTTP2 连接不稳定或限速
- DNS 解析异常或链路抖动
- Git 使用 HTTP/2 与中间网络设备不兼容（部分环境会触发 reset）

## Mitigations / Workarounds（按优先级）

### A. 优先使用 SSH Remote（推荐）

将远端从 HTTPS 改为 SSH（需要你在 GitHub 配置 SSH key）：

```bash
git remote set-url origin git@github.com:kipp7/landslide-monitoring-v2.git
```

验证：

```bash
ssh -T git@github.com
git fetch origin
```

### B. 强制 Git 使用 HTTP/1.1（常见有效）

```bash
git config --global http.version HTTP/1.1
```

然后重试 `git fetch`。

### C. 配置/校验代理（如你在用代理）

查看当前配置：

```bash
git config --global --get http.proxy
git config --global --get https.proxy
```

如果不需要代理，清掉：

```bash
git config --global --unset http.proxy
git config --global --unset https.proxy
```

### D. 证据收集（便于排查）

开启 Git 网络调试（仅用于排查）：

```bash
set GIT_CURL_VERBOSE=1
set GIT_TRACE=1
git fetch origin
```

把输出作为 Issue/Incident 的 evidence（注意不要包含 token/secret）。

## Resolution（本次建议）

- 若长期不稳定：优先切换为 SSH。
- 若短期解决：尝试 `http.version=HTTP/1.1` 并确认 DNS/代理配置正确。

## Prevention

- 在 `docs/guides/standards/pull-request-howto.md` 增加“网络不稳定时的替代路径”：
  - 通过 GitHub 网页创建 PR、解决冲突、合并
  - 命令行仅做本地门禁与小步提交

