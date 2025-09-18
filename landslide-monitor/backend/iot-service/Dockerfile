# 滑坡监测系统 - 后端服务 Dockerfile
# 多阶段构建，优化镜像大小

# 构建阶段
FROM node:18-alpine as builder

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装依赖 (生产环境)
RUN npm ci --only=production && npm cache clean --force

# 运行阶段
FROM node:18-alpine as runtime

# 安装必要的系统工具
RUN apk add --no-cache curl tzdata

# 设置时区
ENV TZ=Asia/Shanghai

# 创建应用用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 设置工作目录
WORKDIR /app

# 从构建阶段复制node_modules
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# 复制应用代码
COPY --chown=nodejs:nodejs . .

# 创建日志目录
RUN mkdir -p logs && chown nodejs:nodejs logs

# 切换到应用用户
USER nodejs

# 暴露端口
EXPOSE 5100

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5100/health || exit 1

# 启动命令
CMD ["node", "iot-server.js"]
