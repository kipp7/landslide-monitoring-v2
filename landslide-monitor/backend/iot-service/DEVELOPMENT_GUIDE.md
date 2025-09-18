# 🚀 滑坡监测系统 - 多环境开发指南

## 📋 目录
- [环境配置](#环境配置)
- [开发流程](#开发流程)
- [版本控制](#版本控制)
- [部署策略](#部署策略)
- [常见问题](#常见问题)

## 🔧 环境配置

### **环境类型**
- **本地开发** (Windows/Mac/Linux)
- **测试环境** (可选)
- **生产环境** (Ubuntu Server)

### **配置文件结构**
```
iot-service/
├── config.js          # 统一配置管理 ✅
├── .env               # 本地环境变量 (不提交)
├── .env.example       # 配置示例 (提交)
├── .gitignore         # 忽略敏感文件
└── package.json       # 依赖管理
```

## ⚙️ 快速开始

### **1. 克隆项目后的初始化**
```bash
# 进入项目目录
cd landslide-monitor/backend/iot-service

# 安装依赖
npm install

# 创建本地环境配置
copy .env.example .env     # Windows
# 或
cp .env.example .env       # Linux/Mac

# 编辑 .env 文件，填入真实配置
```

### **2. 创建 .env 文件内容**
```env
# ================================================================
# 本地开发环境配置
# ================================================================

# 应用配置
NODE_ENV=development
PORT=5100
DEBUG=true

# Supabase 配置
SUPABASE_URL=https://sdssoyyjhunltmcjoxtg.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA

# 华为云IoT配置  
HUAWEI_IOT_ENDPOINT=https://361017cfc6.st1.iotda-app.cn-north-4.myhuaweicloud.com:443
HUAWEI_IOT_PROJECT_ID=361017cfc6
HUAWEI_IOT_DEVICE_ID=6815a14f9314d118511807c6_rk2206

# WebSocket配置
ENABLE_WEBSOCKET=true
WEBSOCKET_CORS_ORIGIN=*

# CORS配置
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

### **3. 运行项目**
```bash
# 开发模式启动
npm run dev

# 生产模式启动
npm start

# 检查数据库连接
npm run check:db
```

## 🔄 开发流程

### **本地开发 → 服务器部署流程**

```mermaid
graph LR
    A[本地开发] --> B[功能完成]
    B --> C[本地测试]
    C --> D[提交代码]
    D --> E[推送到远程]
    E --> F[服务器拉取]
    F --> G[生产部署]
```

### **详细步骤**

#### **1. 本地开发**
```bash
# 1. 创建功能分支
git checkout -b feature/新功能名

# 2. 开发代码
# ... 编写代码 ...

# 3. 本地测试
npm run dev
```

#### **2. 代码提交**
```bash
# 1. 暂存文件 (不包括 .env)
git add .

# 2. 提交代码
git commit -m "feat: 新功能描述"

# 3. 推送到远程
git push origin feature/新功能名
```

#### **3. 服务器更新**
```bash
# SSH到服务器
ssh user@your-server

# 进入项目目录
cd /path/to/landslide-monitor/backend/iot-service

# 拉取最新代码
git pull origin main

# 重启服务
pm2 restart landslide-iot-service
# 或使用你的服务管理工具
```

## 🗂️ 版本控制最佳实践

### **Git分支策略**
```
main                    # 生产分支
├── develop            # 开发分支  
├── feature/功能名      # 功能分支
├── hotfix/修复名       # 紧急修复
└── release/版本号      # 发布分支
```

### **.gitignore 配置**
```gitignore
# 环境文件
.env
.env.local
.env.*.local

# 日志文件
*.log
logs/
server.log

# 依赖目录
node_modules/
npm-debug.log*

# 临时文件
.tmp/
.cache/
.DS_Store
```

### **敏感信息管理**
- ✅ **DO**: 使用 `.env` 文件管理敏感信息
- ✅ **DO**: 提交 `.env.example` 作为配置模板
- ❌ **DON'T**: 将 `.env` 文件提交到版本控制
- ❌ **DON'T**: 在代码中硬编码密钥

## 🚀 部署策略

### **环境隔离策略**

#### **方案一: 分支隔离** (推荐)
```bash
# 本地开发
git checkout develop
# ... 开发完成 ...

# 合并到main分支用于生产
git checkout main
git merge develop

# 服务器拉取生产分支
git pull origin main
```

#### **方案二: 配置隔离**
```bash
# 本地环境
NODE_ENV=development

# 生产环境
NODE_ENV=production
```

#### **方案三: Docker容器隔离** (高级)
```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY . .
EXPOSE 5100
CMD ["npm", "start"]
```

### **服务器配置管理**

#### **使用PM2管理进程**
```bash
# 安装PM2
npm install -g pm2

# 创建ecosystem配置
# ecosystem.config.js
module.exports = {
  apps: [{
    name: 'landslide-iot-service',
    script: 'iot-server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 5100
    }
  }]
};

# 启动服务
pm2 start ecosystem.config.js
pm2 startup  # 开机自启
pm2 save     # 保存配置
```

#### **Nginx反向代理**
```nginx
# /etc/nginx/sites-available/landslide-monitor
server {
    listen 80;
    server_name your-domain.com;
    
    location /api/ {
        proxy_pass http://localhost:5100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🐛 常见问题解决

### **问题1: dotenv未安装**
```bash
# 错误信息
dotenv未安装，使用默认配置

# 解决方案
npm install dotenv
```

### **问题2: Supabase URL缺失**
```bash
# 错误信息  
Error: supabaseUrl is required.

# 解决方案
# 1. 创建 .env 文件
# 2. 添加 SUPABASE_URL 配置
# 3. 检查 config.js 是否正确导入
```

### **问题3: 权限问题**
```bash
# 错误信息
Permission denied

# 解决方案 (Ubuntu)
sudo chown -R $USER:$USER /path/to/project
chmod +x start.sh
```

### **问题4: 端口被占用**
```bash
# 查看端口占用
netstat -tulpn | grep 5100

# 杀死进程
sudo kill -9 <PID>

# 或修改端口
echo "PORT=5101" >> .env
```

## 📊 监控和日志

### **日志管理**
```javascript
// 在 config.js 中配置
LOG_LEVEL=info      # 日志级别
LOG_FILE=server.log # 日志文件
```

### **性能监控**
```bash
# 使用PM2监控
pm2 monit

# 查看日志
pm2 logs landslide-iot-service

# 重启服务
pm2 restart landslide-iot-service
```

## 🔒 安全最佳实践

1. **环境变量安全**
   - 不要在代码中硬编码密钥
   - 使用强密码和安全的API密钥
   - 定期更新密钥

2. **网络安全**
   - 配置CORS限制
   - 使用HTTPS
   - 限制服务器端口访问

3. **代码安全**
   - 定期更新依赖包
   - 使用 `npm audit` 检查漏洞
   - 代码审查

## 📞 技术支持

如遇到问题，请检查：
1. 环境配置是否正确
2. 依赖是否完整安装
3. 网络连接是否正常
4. 日志中的错误信息

---

**维护团队**: 派派  
**最后更新**: 2025-01-18  
**版本**: v1.0.0
