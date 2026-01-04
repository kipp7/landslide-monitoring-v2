# Postman 测试套件（本地）

用于快速验证：接口连通、token 是否生效、数据格式是否对齐。

## 导入

在 Postman 里执行 Import：

- `docs/tools/postman/lsmv2.postman_collection.json`
- `docs/tools/postman/lsmv2.local.postman_environment.json`

导入后，右上角选择环境：`lsmv2-local`。

## 变量说明

- `baseUrl`：默认 `http://localhost:8080`
- `token`：默认 `dev`（本地联调用）

