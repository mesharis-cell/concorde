FROM public.ecr.aws/docker/library/node:20-slim as dependencies
RUN apt-get update -y && apt-get install -y openssl curl unzip
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM public.ecr.aws/docker/library/node:20-slim as build
RUN apt-get update -y && apt-get install -y openssl curl unzip
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"
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