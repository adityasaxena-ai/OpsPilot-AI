FROM node:22-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm exec tsc -b --force packages/types packages/telemetry apps/web

ARG VITE_API_URL=https://opspilotapi-production.up.railway.app
ENV VITE_API_URL=$VITE_API_URL

RUN echo "web-build-cache-bust=2026-08-13" && pnpm --filter @opspilot/web build

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["pnpm", "start"]
