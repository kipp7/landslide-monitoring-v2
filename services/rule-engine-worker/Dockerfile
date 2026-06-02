FROM node:20-alpine AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY libs/observability/package.json libs/observability/package.json
COPY libs/rules/package.json libs/rules/package.json
COPY libs/validation/package.json libs/validation/package.json
COPY services/rule-engine-worker/package.json services/rule-engine-worker/package.json

RUN npm ci

FROM deps AS builder
WORKDIR /repo

COPY tsconfig.base.json ./
COPY libs/observability libs/observability
COPY libs/rules libs/rules
COPY libs/validation libs/validation
COPY services/rule-engine-worker services/rule-engine-worker

RUN npm -w libs/observability run build \
  && npm -w libs/rules run build \
  && npm -w libs/validation run build \
  && npm -w services/rule-engine-worker run build

RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=builder /repo/package.json /repo/package.json
COPY --from=builder /repo/node_modules /repo/node_modules

COPY --from=builder /repo/libs/observability/package.json /repo/libs/observability/package.json
COPY --from=builder /repo/libs/observability/dist /repo/libs/observability/dist

COPY --from=builder /repo/libs/rules/package.json /repo/libs/rules/package.json
COPY --from=builder /repo/libs/rules/dist /repo/libs/rules/dist

COPY --from=builder /repo/libs/validation/package.json /repo/libs/validation/package.json
COPY --from=builder /repo/libs/validation/dist /repo/libs/validation/dist

COPY --from=builder /repo/services/rule-engine-worker/package.json /repo/services/rule-engine-worker/package.json
COPY --from=builder /repo/services/rule-engine-worker/dist /repo/services/rule-engine-worker/dist

COPY docs/integrations/kafka/schemas /repo/docs/integrations/kafka/schemas

CMD ["node", "services/rule-engine-worker/dist/index.js"]
