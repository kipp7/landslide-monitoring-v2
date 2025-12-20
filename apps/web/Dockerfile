# 滑坡监测系统 - 前端服务 Dockerfile
# 多阶段构建，优化镜像大小

# 构建阶段
FROM node:18-alpine as builder

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装依赖
RUN npm ci && npm cache clean --force

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

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

# 设置环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 从构建阶段复制必要文件
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

# 切换到应用用户
USER nodejs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

# 启动命令
CMD ["node", "server.js"]
