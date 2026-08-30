# Use official minimal Node.js Alpine base image
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev && npm cache clean --force

# Copy application source code with proper ownership
COPY --chown=node:node . .

# Switch to non-root user for security best practice
USER node

# Expose internal backend port (documented for container metadata)
EXPOSE 3000

# Container healthcheck using IPv127.0.0.1 for Alpine compatibility
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Start the application
CMD ["node", "server.js"]
