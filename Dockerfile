FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts

COPY tsconfig.json nest-cli.json ./
COPY src ./src
# Eval types/scenarios/fixtures used by the admin scenario runner now
# live under src/eval (moved from test/eval to honour the
# production-code-must-not-import-from-test/ rule). They get included
# via COPY src ./src — no extra COPY needed.

RUN pnpm build

# ── Runtime ──────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/src/main.js"]
