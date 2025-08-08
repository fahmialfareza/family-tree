# Stage 1: Build base image
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Corepack
RUN npm install --global corepack@latest
RUN corepack enable

# Install specific version of pnpm (version 8)
RUN corepack prepare pnpm@9 --activate

WORKDIR /app

# Create a non-root user and group
RUN groupadd -r nonroot && useradd -r -g nonroot -u 777 nonroot

# Copy only the necessary files to install dependencies
COPY package.json pnpm-lock.yaml ./

# Stage 2: Install production dependencies
FROM base AS prod-deps
RUN pnpm install --prod --frozen-lockfile

# Stage 3: Install build dependencies and build the application
FROM base AS builder
# Re-use pnpm cache and install all dependencies (including dev dependencies)
RUN pnpm install --frozen-lockfile

# Copy source files for building
COPY . .

# Build the application
RUN pnpm run build

# Stage 4: Create a minimal production image
FROM base AS runner
ENV NODE_ENV=production

# Copy the built application and required files
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/newrelic.cjs /app/newrelic.cjs
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/tmp /app/tmp

# Set the ownership of the application files to the non-root user
RUN chown -R nonroot:nonroot /app
RUN chown -R nonroot:nonroot /app/tmp

# Switch to non-root user
USER nonroot

CMD [ "node", "--enable-source-maps", "-r", "newrelic", "./dist" ]
