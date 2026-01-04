# 滑坡监测系统 - Web 前端（Next.js）Dockerfile
# - 输出使用 Next.js standalone 模式（适合生产部署）
# - Docker 内部默认使用标准 distDir: .next（避免自定义目录导致拷贝路径不一致）

# 构建依赖阶段
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# 构建阶段
FROM deps AS builder
WORKDIR /app

ARG NEXT_DIST_DIR=.next
ENV NEXT_DIST_DIR=$NEXT_DIST_DIR
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN npm run build

# 运行阶段
FROM node:20-alpine AS runtime

RUN apk add --no-cache curl tzdata
ENV TZ=Asia/Shanghai

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
WORKDIR /app

ARG NEXT_DIST_DIR=.next
ENV NEXT_DIST_DIR=$NEXT_DIST_DIR
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder --chown=nodejs:nodejs /app/${NEXT_DIST_DIR}/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/${NEXT_DIST_DIR}/static ./${NEXT_DIST_DIR}/static
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

USER nodejs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

CMD ["node", "server.js"]
