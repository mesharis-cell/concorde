FROM oven/bun:1 as dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 as build
WORKDIR /app
COPY . .
COPY --from=dependencies /app/node_modules ./node_modules
RUN bun run prisma:generate

# Create non-root user
RUN addgroup --system --gid 1001 bunjs
RUN adduser --system --uid 1001 bunjs
USER bunjs

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]