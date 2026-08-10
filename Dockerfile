FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build the TanStack Start app (required for serve.ts)
RUN bun run build

# Init DB, start server immediately, then populate data pipeline
EXPOSE 3000
CMD bun run src/db/init.ts && (bun run start &) && sleep 3 && bun run run_pipeline.ts && wait