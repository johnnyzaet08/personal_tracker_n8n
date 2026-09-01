FROM node:24.19.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@11.19.0
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @tracker/contracts build \
  && pnpm --filter @tracker/database build \
  && pnpm --filter @tracker/api build

FROM dependencies AS migrate
COPY . .
CMD ["pnpm", "--filter", "@tracker/database", "prisma:migrate"]

FROM node:24.19.0-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /workspace/node_modules /app/node_modules
COPY --from=builder /workspace/apps/api/node_modules /app/apps/api/node_modules
COPY --from=builder /workspace/apps/api/dist /app/apps/api/dist
COPY --from=builder /workspace/packages/contracts/node_modules /app/packages/contracts/node_modules
COPY --from=builder /workspace/packages/contracts/dist /app/packages/contracts/dist
COPY --from=builder /workspace/packages/contracts/package.json /app/packages/contracts/package.json
COPY --from=builder /workspace/packages/database/node_modules /app/packages/database/node_modules
COPY --from=builder /workspace/packages/database/dist /app/packages/database/dist
COPY --from=builder /workspace/packages/database/package.json /app/packages/database/package.json
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
