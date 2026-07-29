FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build the TanStack Start app (required for serve.ts)
RUN bun run build

# Start server (pipeline runs via deploy hook or manual trigger)
EXPOSE 3000
CMD bun run start