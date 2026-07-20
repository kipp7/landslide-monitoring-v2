FROM node:20-alpine AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/edge-risk-model/package.json packages/edge-risk-model/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY libs/regional-model-library/package.json libs/regional-model-library/package.json
COPY services/ai-prediction-worker/package.json services/ai-prediction-worker/package.json

RUN npm ci

FROM deps AS builder
WORKDIR /repo

COPY tsconfig.base.json ./
COPY packages/edge-risk-model packages/edge-risk-model
COPY packages/observability packages/observability
COPY packages/validation packages/validation
COPY libs/regional-model-library libs/regional-model-library
COPY services/ai-prediction-worker services/ai-prediction-worker

RUN npm -w packages/edge-risk-model run build \
  && npm -w packages/observability run build \
  && npm -w packages/validation run build \
  && npm -w libs/regional-model-library run build \
  && npm -w services/ai-prediction-worker run build

RUN npm prune --omit=dev
RUN node -e "require('ajv/dist/2020'); require('./packages/validation/dist').createAjv()"

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=builder /repo/package.json /repo/package.json
COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/packages/edge-risk-model/package.json /repo/packages/edge-risk-model/package.json
COPY --from=builder /repo/packages/edge-risk-model/dist /repo/packages/edge-risk-model/dist
COPY --from=builder /repo/packages/observability/package.json /repo/packages/observability/package.json
COPY --from=builder /repo/packages/observability/dist /repo/packages/observability/dist
COPY --from=builder /repo/packages/validation/package.json /repo/packages/validation/package.json
COPY --from=builder /repo/packages/validation/dist /repo/packages/validation/dist
COPY --from=builder /repo/libs/regional-model-library/package.json /repo/libs/regional-model-library/package.json
COPY --from=builder /repo/libs/regional-model-library/dist /repo/libs/regional-model-library/dist
COPY --from=builder /repo/services/ai-prediction-worker/package.json /repo/services/ai-prediction-worker/package.json
COPY --from=builder /repo/services/ai-prediction-worker/dist /repo/services/ai-prediction-worker/dist
COPY docs/integrations/kafka/schemas /repo/docs/integrations/kafka/schemas

RUN mkdir -p /data/models && chown -R node:node /repo /data/models

VOLUME ["/data/models"]
USER node
CMD ["node", "services/ai-prediction-worker/dist/index.js"]
