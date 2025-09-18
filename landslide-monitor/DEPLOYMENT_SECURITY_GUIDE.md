# 🔒 滑坡监测系统 - 安全部署指南

## ⚠️ 重要安全须知

**绝对不要将真实密钥提交到Git仓库！**

## 📋 部署前准备

### 1. 环境变量配置

```bash
# 复制环境变量模板
cp env.example .env

# 编辑 .env 文件，填写真实的配置信息
nano .env
```

### 2. 必需的环境变量

#### Supabase 配置 (必需)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_actual_anon_key_here
```

#### 前端环境变量
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key_here
```

## 🚀 部署步骤

### 本地开发环境

1. **克隆仓库**
   ```bash
   git clone <your-repository-url>
   cd landslide-monitor
   ```

2. **配置环境变量**
   ```bash
   cp env.example .env
   # 编辑 .env 文件填写真实配置
   ```

3. **安装依赖**
   ```bash
   # 后端
   cd backend/iot-service
   npm install
   
   # 前端
   cd ../../frontend
   npm install
   ```

4. **启动服务**
   ```bash
   # 启动后端
   cd backend/iot-service
   npm start
   
   # 启动前端 (新终端)
   cd frontend
   npm run dev
   ```

### 生产环境部署

1. **服务器环境变量**
   ```bash
   # 在服务器上设置环境变量
   export SUPABASE_URL="your_production_supabase_url"
   export SUPABASE_ANON_KEY="your_production_anon_key"
   export NODE_ENV="production"
   ```

2. **Docker 部署**
   ```bash
   # 构建镜像
   docker build -t landslide-monitor .
   
   # 运行容器 (使用环境变量)
   docker run -d \
     -e SUPABASE_URL="your_url" \
     -e SUPABASE_ANON_KEY="your_key" \
     -p 3000:3000 \
     landslide-monitor
   ```

## 🔐 密钥管理最佳实践

### ✅ 推荐做法
- 使用环境变量存储敏感信息
- 使用 `.env.example` 作为配置模板
- 在生产环境使用密钥管理服务
- 定期轮换密钥

### ❌ 禁止做法
- 硬编码密钥到源代码中
- 将 `.env` 文件提交到Git
- 在日志中输出敏感信息
- 通过聊天工具传输密钥

## 🛡️ 安全检查清单

- [ ] `.env` 文件已添加到 `.gitignore`
- [ ] 所有硬编码密钥已移除
- [ ] 环境变量正确配置
- [ ] 生产环境使用HTTPS
- [ ] 数据库访问权限正确设置
- [ ] 定期备份数据库

## 📞 支持联系

如有安全问题或部署困难，请联系技术支持。

---

**记住：安全是第一优先级！** 🔐
