# Use an official Node.js runtime as a parent image
FROM node:20-slim as builder

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# --- Final Stage ---
FROM node:20-slim

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
LABEL org.opencontainers.image.source=https://github.com/BobBobinson007/NotioOS
LABEL org.opencontainers.image.description="NotioOS – Minimalist productivity platform"
LABEL org.opencontainers.image.licenses=MIT

CMD ["npm", "start"]
