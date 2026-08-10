FROM node:22-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages packages

RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_API_URL=https://opspilotapi-production.up.railway.app
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm --filter @opspilot/web build

EXPOSE 3000

CMD ["pnpm", "--filter", "@opspilot/web", "start"]
