# Build stage
FROM node:22-alpine AS builder

# Install git which might be needed for some packages
RUN apk add --no-cache git python3 make g++

# Increase max memory for Node.js during build
ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /app

# Copy package files
COPY package.json ./
COPY package-lock.json ./

# Install dependencies (use --legacy-peer-deps to resolve dependency conflicts)
RUN npm ci --legacy-peer-deps

# Copy source (excluding node_modules and .svelte-kit which will be regenerated)
COPY . .

# Build with increased memory limits
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Create data directory
RUN mkdir -p /data

# Environment
ENV HOST=0.0.0.0
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start (SvelteKit adapter-node creates index.js in build directory)
CMD ["node", "build/index.js"]
