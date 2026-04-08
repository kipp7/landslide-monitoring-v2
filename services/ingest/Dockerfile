FROM node:20-alpine AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY libs/observability/package.json libs/observability/package.json
COPY libs/validation/package.json libs/validation/package.json
COPY services/ingest/package.json services/ingest/package.json

RUN npm ci

FROM deps AS builder
WORKDIR /repo

COPY tsconfig.base.json ./
COPY libs/observability libs/observability
COPY libs/validation libs/validation
COPY services/ingest services/ingest

RUN npm -w libs/observability run build \
  && npm -w libs/validation run build \
  && npm -w services/ingest run build

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

COPY --from=builder /repo/services/ingest/package.json /repo/services/ingest/package.json
COPY --from=builder /repo/services/ingest/dist /repo/services/ingest/dist

COPY docs/integrations/mqtt/schemas /repo/docs/integrations/mqtt/schemas
COPY docs/integrations/kafka/schemas /repo/docs/integrations/kafka/schemas

CMD ["node", "services/ingest/dist/index.js"]
