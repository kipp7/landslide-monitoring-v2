FROM node:20-alpine AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/observability/package.json packages/observability/package.json
COPY services/tongxiao-alarm-bridge/package.json services/tongxiao-alarm-bridge/package.json

RUN npm ci

FROM deps AS builder
WORKDIR /repo

COPY tsconfig.base.json ./
COPY packages/observability packages/observability
COPY services/tongxiao-alarm-bridge services/tongxiao-alarm-bridge

RUN npm -w packages/observability run build \
  && npm -w services/tongxiao-alarm-bridge run build

RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=builder /repo/package.json /repo/package.json
COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/packages/observability/package.json /repo/packages/observability/package.json
COPY --from=builder /repo/packages/observability/dist /repo/packages/observability/dist
COPY --from=builder /repo/services/tongxiao-alarm-bridge/package.json /repo/services/tongxiao-alarm-bridge/package.json
COPY --from=builder /repo/services/tongxiao-alarm-bridge/dist /repo/services/tongxiao-alarm-bridge/dist

CMD ["node", "services/tongxiao-alarm-bridge/dist/src/index.js"]
