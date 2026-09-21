FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2
WORKDIR /app
COPY deploy/google-hosting/package.json deploy/google-hosting/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY api/ ./api/
COPY frontend/data/activity-model.js frontend/data/sector-registry.js ./frontend/data/
COPY config/pre-gematik/email/ ./config/pre-gematik/email/
COPY dist/google-hosting/ ./frontend-build/
ARG PRODUCT_VERSION
ARG SOURCE_REVISION
ARG SOURCE_URL
RUN printf '%s' "$PRODUCT_VERSION" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
    && printf '%s' "$SOURCE_REVISION" | grep -Eq '^[0-9a-f]{40}$' \
    && printf '%s' "$SOURCE_URL" | grep -Eq '^https://[A-Za-z0-9.-]+/[A-Za-z0-9._/-]+$'
LABEL org.opencontainers.image.title="Versorgungs-Kompass Google Hosting" \
      org.opencontainers.image.source="$SOURCE_URL" \
      org.opencontainers.image.revision="$SOURCE_REVISION" \
      org.opencontainers.image.version="$PRODUCT_VERSION"
ENV NODE_ENV=production PORT=8080 GOOGLE_FRONTEND_ROOT=/app/frontend-build
EXPOSE 8080
USER node
CMD ["node", "api/server.mjs"]
