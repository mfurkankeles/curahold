# Curahold on your own server: one company, your own Postgres, files on disk.
# Usually run with docker-compose.yml (Postgres included); the help page
# "Running Curahold on your own server" walks through it.
#   docker build -t curahold .

# 1. Build the app, its help pages and the server (one file, libraries inside).
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run build:server

# 2. What runs: Node, the built files and the database changes. No source code
#    and no node_modules.
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    FILES_DIR=/data/files \
    APP_ROOT=/app
WORKDIR /app
COPY --from=build /src/dist/web ./dist/web
COPY --from=build /src/dist/portal ./dist/portal
COPY --from=build /src/dist/server ./dist/server
COPY --from=build /src/db/migrations ./db/migrations
# Attachments live in /data (a volume); the server runs as the unprivileged "node" user.
RUN mkdir -p /data/files && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health > /dev/null || exit 1
CMD ["node", "--enable-source-maps", "dist/server/selfhost.mjs"]
