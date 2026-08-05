FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

WORKDIR /app
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/corepack \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg \
      /opt/yarn-v1.22.22

COPY api/ ./api/
COPY config/pre-gematik/email/pre-gematik-password-reset.html ./config/pre-gematik/email/pre-gematik-password-reset.html
COPY config/pre-gematik/email/pre-gematik-password-reset.txt ./config/pre-gematik/email/pre-gematik-password-reset.txt
COPY config/pre-gematik/email/assets/versorgungs-kompass-mark-on-dark.png ./config/pre-gematik/email/assets/versorgungs-kompass-mark-on-dark.png
COPY config/pre-gematik/email/assets/stakeholder-mark-on-dark.png ./config/pre-gematik/email/assets/stakeholder-mark-on-dark.png
COPY config/pre-gematik/email/assets/hospitation-mark-on-dark.png ./config/pre-gematik/email/assets/hospitation-mark-on-dark.png
COPY config/pre-gematik/email/assets/formate-mark-on-dark.png ./config/pre-gematik/email/assets/formate-mark-on-dark.png
COPY frontend/data/activity-model.js ./frontend/data/activity-model.js
COPY frontend/data/sector-registry.js ./frontend/data/sector-registry.js

ARG PRODUCT_VERSION
ARG SOURCE_REVISION
ARG SOURCE_URL
RUN printf '%s' "$PRODUCT_VERSION" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
    && printf '%s' "$SOURCE_REVISION" | grep -Eq '^[0-9a-fA-F]{40,64}$' \
    && printf '%s' "$SOURCE_URL" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~%+-]+)+$'

LABEL org.opencontainers.image.title="Versorgungs-Kompass API" \
      org.opencontainers.image.description="Geschuetzte API-Laufzeit des Versorgungs-Kompass" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="$SOURCE_URL" \
      org.opencontainers.image.revision="$SOURCE_REVISION" \
      org.opencontainers.image.version="$PRODUCT_VERSION"

ENV NODE_ENV=production \
    PORT=8080
EXPOSE 8080

USER node

CMD ["node", "api/server.mjs"]
