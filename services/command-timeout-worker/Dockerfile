FROM node:20-alpine AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/observability/package.json packages/observability/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY services/command-timeout-worker/package.json services/command-timeout-worker/package.json

RUN npm ci

FROM deps AS builder
WORKDIR /repo

COPY tsconfig.base.json ./
COPY packages/observability packages/observability
COPY packages/validation packages/validation
COPY services/command-timeout-worker services/command-timeout-worker

RUN npm -w packages/observability run build \
  && npm -w packages/validation run build \
  && npm -w services/command-timeout-worker run build

RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=builder /repo/package.json /repo/package.json
COPY --from=builder /repo/node_modules /repo/node_modules

COPY --from=builder /repo/packages/observability/package.json /repo/packages/observability/package.json
COPY --from=builder /repo/packages/observability/dist /repo/packages/observability/dist

COPY --from=builder /repo/packages/validation/package.json /repo/packages/validation/package.json
COPY --from=builder /repo/packages/validation/dist /repo/packages/validation/dist

COPY --from=builder /repo/services/command-timeout-worker/package.json /repo/services/command-timeout-worker/package.json
COPY --from=builder /repo/services/command-timeout-worker/dist /repo/services/command-timeout-worker/dist

COPY docs/integrations/kafka/schemas /repo/docs/integrations/kafka/schemas

CMD ["node", "services/command-timeout-worker/dist/index.js"]
