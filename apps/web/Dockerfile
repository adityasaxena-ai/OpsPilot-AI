FROM node:22-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

COPY package.json ./

RUN pnpm install

COPY . .

ARG VITE_API_URL=https://opspilotapi-production.up.railway.app
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
