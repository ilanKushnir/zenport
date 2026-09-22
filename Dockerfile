# ZenPort production image.
# Multi-stage: build the workspaces with dev deps, then a slim non-root
# runtime. SQLite is node:sqlite (built into Node) — no native modules.

FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY web web
RUN npm run build --workspace @zenport/shared \
 && npm run build --workspace @zenport/server \
 && npm run build --workspace @zenport/web

# Production node_modules only (server runtime deps).
FROM node:26-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:26-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends gosu tini wget ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    ZP_DATA_DIR=/data \
    ZP_HOST=0.0.0.0 \
    ZP_PORT=8484

COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/shared/package.json shared/package.json
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/web/dist web/dist
COPY package.json LICENSE ./
COPY docker/entrypoint.sh /entrypoint.sh
# The node base image ships a `node` user at 1000:1000; replace it so
# `zenport` can take that UID/GID and match typical host volumes.
RUN chmod +x /entrypoint.sh \
 && userdel -r node \
 && if getent group node >/dev/null; then groupdel node; fi \
 && groupadd -g 1000 zenport \
 && useradd -m -u 1000 -g zenport -s /usr/sbin/nologin zenport \
 && mkdir -p /data \
 && chown -R zenport:zenport /data

EXPOSE 8484
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:${ZP_PORT}/api/health || exit 1

# Entrypoint runs as root only to align UID/GID with PUID/PGID and chown
# /data, then drops privileges with gosu. Library mounts stay read-only.
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
