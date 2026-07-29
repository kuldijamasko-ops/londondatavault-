FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Initialize DB, run pipeline, then start server
EXPOSE 3000
CMD bun run src/db/init.ts && bun run run_pipeline.ts && bun run start