FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Initialize DB, start server, then run pipeline in background
# Server starts first so Render's health check passes immediately
EXPOSE 3000
CMD bun run src/db/init.ts && (bun run start &) && sleep 2 && bun run run_pipeline.ts && wait