# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /repo

# Install deps (monorepo workspaces) with good Docker layer caching.
COPY package.json package-lock.json ./
COPY libs/observability/package.json libs/observability/package.json
COPY libs/rules/package.json libs/rules/package.json
COPY libs/validation/package.json libs/validation/package.json
COPY services/api/package.json services/api/package.json

RUN npm ci

FROM deps AS builder
WORKDIR /repo

COPY tsconfig.base.json ./
COPY libs/observability libs/observability
COPY libs/rules libs/rules
COPY libs/validation libs/validation
COPY services/api services/api

RUN npm -w libs/observability run build \
  && npm -w libs/rules run build \
  && npm -w libs/validation run build \
  && npm -w services/api run build

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

COPY --from=builder /repo/services/api/package.json /repo/services/api/package.json
COPY --from=builder /repo/services/api/dist /repo/services/api/dist

EXPOSE 8080
CMD ["node", "services/api/dist/index.js"]

