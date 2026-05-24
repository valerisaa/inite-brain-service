FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts

COPY tsconfig.json nest-cli.json ./
COPY src ./src
# Admin scenario runner imports declarative eval data from test/eval/.
# Code stays in src/; only the data files (types, scenarios, fixtures)
# need to be present at build time — no Jest runtime is pulled in.
COPY test/eval/types.ts ./test/eval/types.ts
COPY test/eval/scenarios ./test/eval/scenarios
COPY test/eval/fixtures ./test/eval/fixtures

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
