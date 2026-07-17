FROM node:20-alpine AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/observability/package.json packages/observability/package.json
COPY libs/rules/package.json libs/rules/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY services/rule-engine-worker/package.json services/rule-engine-worker/package.json

RUN npm ci

FROM deps AS builder
WORKDIR /repo

COPY tsconfig.base.json ./
COPY packages/observability packages/observability
COPY libs/rules libs/rules
COPY packages/validation packages/validation
COPY services/rule-engine-worker services/rule-engine-worker

RUN npm -w packages/observability run build \
  && npm -w libs/rules run build \
  && npm -w packages/validation run build \
  && npm -w services/rule-engine-worker run build

RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=builder /repo/package.json /repo/package.json
COPY --from=builder /repo/node_modules /repo/node_modules

COPY --from=builder /repo/packages/observability/package.json /repo/packages/observability/package.json
COPY --from=builder /repo/packages/observability/dist /repo/packages/observability/dist

COPY --from=builder /repo/libs/rules/package.json /repo/libs/rules/package.json
COPY --from=builder /repo/libs/rules/dist /repo/libs/rules/dist

COPY --from=builder /repo/packages/validation/package.json /repo/packages/validation/package.json
COPY --from=builder /repo/packages/validation/dist /repo/packages/validation/dist

COPY --from=builder /repo/services/rule-engine-worker/package.json /repo/services/rule-engine-worker/package.json
COPY --from=builder /repo/services/rule-engine-worker/dist /repo/services/rule-engine-worker/dist

COPY docs/integrations/kafka/schemas /repo/docs/integrations/kafka/schemas

CMD ["node", "services/rule-engine-worker/dist/index.js"]
