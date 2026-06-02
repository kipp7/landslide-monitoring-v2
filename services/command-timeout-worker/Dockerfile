FROM node:20-alpine AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY libs/observability/package.json libs/observability/package.json
COPY libs/validation/package.json libs/validation/package.json
COPY services/command-timeout-worker/package.json services/command-timeout-worker/package.json

RUN npm ci

FROM deps AS builder
WORKDIR /repo

COPY tsconfig.base.json ./
COPY libs/observability libs/observability
COPY libs/validation libs/validation
COPY services/command-timeout-worker services/command-timeout-worker

RUN npm -w libs/observability run build \
  && npm -w libs/validation run build \
  && npm -w services/command-timeout-worker run build

RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=builder /repo/package.json /repo/package.json
COPY --from=builder /repo/node_modules /repo/node_modules

COPY --from=builder /repo/libs/observability/package.json /repo/libs/observability/package.json
COPY --from=builder /repo/libs/observability/dist /repo/libs/observability/dist

COPY --from=builder /repo/libs/validation/package.json /repo/libs/validation/package.json
COPY --from=builder /repo/libs/validation/dist /repo/libs/validation/dist

COPY --from=builder /repo/services/command-timeout-worker/package.json /repo/services/command-timeout-worker/package.json
COPY --from=builder /repo/services/command-timeout-worker/dist /repo/services/command-timeout-worker/dist

COPY docs/integrations/kafka/schemas /repo/docs/integrations/kafka/schemas

CMD ["node", "services/command-timeout-worker/dist/index.js"]
