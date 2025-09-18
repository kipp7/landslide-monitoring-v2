# 滑坡监测系统 - 后端服务

## 目录结构

```
backend/
├── iot-service/          # IoT数据接收服务
│   ├── iot-server.js     # 主服务文件
│   ├── package.json      # 依赖配置
│   ├── start.sh          # 启动脚本
│   └── README.md         # 服务说明
├── api-service/          # 其他API服务（预留）
├── shared/               # 共享代码和工具（预留）
└── package.json          # 后端总配置
```

## 快速启动

### IoT数据接收服务

```bash
# 启动IoT服务
npm run start:iot

# 停止IoT服务
npm run stop:iot

# 重启IoT服务
npm run restart:iot

# 查看IoT服务日志
npm run logs:iot

# 测试IoT服务
npm run test:iot
```

### 查看所有服务状态

```bash
npm run status
```

## 服务说明

### IoT数据接收服务
- **端口**: 5100
- **功能**: 接收华为云IoT平台推送的数据
- **数据库**: Supabase (huawei_iot_data表)
- **访问地址**: http://ylsf.chat:1020/iot/huawei

### API服务（预留）
- **端口**: 待定
- **功能**: 提供其他API接口

## 开发指南

### 添加新服务

1. 在backend目录下创建新的服务目录
2. 添加相应的npm scripts
3. 更新nginx配置（如果需要）

### 环境配置

每个服务都有自己的环境配置，请参考各服务目录下的README。

## 部署说明

### nginx配置

确保nginx配置包含后端服务的转发：

```nginx
# IoT数据接收
location /iot/ {
    proxy_pass http://127.0.0.1:5100;
    # ... 其他配置
}

# 其他API（如果有）
location /api/ {
    proxy_pass http://127.0.0.1:5000;
    # ... 其他配置
}
```

### 服务管理

建议使用PM2或systemd来管理生产环境的服务。

## 监控和日志

- IoT服务日志: `iot-service/server.log`
- 服务状态检查: `npm run status`
- 健康检查: `curl http://localhost:5100/health`