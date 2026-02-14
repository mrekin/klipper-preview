# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies (use npm install since we don't have package-lock.json)
RUN npm install

# Copy source
COPY . .

# Build
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Create data directory
RUN mkdir -p /data

# Environment
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/tokens.db
ENV HOST=0.0.0.0
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start (SvelteKit adapter-node creates index.js in build directory)
CMD ["node", "build/index.js"]
