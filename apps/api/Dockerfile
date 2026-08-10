FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
COPY prisma prisma

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm exec prisma generate --schema=prisma/schema.prisma

COPY . .

RUN pnpm exec tsc -b --force apps/api/tsconfig.json

EXPOSE 3001

CMD ["node", "apps/api/dist/server.js"]
