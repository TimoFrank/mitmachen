FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2
WORKDIR /app
COPY deploy/google-hosting/package.json deploy/google-hosting/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY api/ ./api/
COPY frontend/data/activity-model.js frontend/data/sector-registry.js ./frontend/data/
COPY scripts/check_pre_gematik_migration_gcp.mjs ./scripts/check_pre_gematik_migration_gcp.mjs
COPY scripts/lib/cloud-sql-managed-proxy.mjs ./scripts/lib/cloud-sql-managed-proxy.mjs
COPY scripts/lib/google-onboarding-contract.mjs ./scripts/lib/google-onboarding-contract.mjs
COPY scripts/lib/target-database-connection.mjs ./scripts/lib/target-database-connection.mjs
COPY scripts/provision_iap_identity_bindings.mjs ./scripts/provision_iap_identity_bindings.mjs
COPY scripts/provision_pre_gematik_identity_platform_account.mjs ./scripts/provision_pre_gematik_identity_platform_account.mjs
COPY scripts/provision_pre_gematik_identity_platform_guest_access.mjs ./scripts/provision_pre_gematik_identity_platform_guest_access.mjs
COPY scripts/provision_pre_gematik_password_invitation.mjs ./scripts/provision_pre_gematik_password_invitation.mjs
COPY scripts/provision_pre_gematik_test_access.mjs ./scripts/provision_pre_gematik_test_access.mjs
COPY scripts/render_pre_gematik_guest_welcome_email.mjs ./scripts/render_pre_gematik_guest_welcome_email.mjs
COPY scripts/send_pre_gematik_guest_welcome_email.mjs ./scripts/send_pre_gematik_guest_welcome_email.mjs
COPY config/pre-gematik/email/ ./config/pre-gematik/email/
COPY public/brand/versorgungs-kompass/mark-on-dark.svg ./public/brand/versorgungs-kompass/mark-on-dark.svg
COPY public/brand/modules/stakeholder/mark-on-dark.svg ./public/brand/modules/stakeholder/mark-on-dark.svg
COPY public/brand/modules/hospitation/mark-on-dark.svg ./public/brand/modules/hospitation/mark-on-dark.svg
COPY public/brand/modules/formate/mark-on-dark.svg ./public/brand/modules/formate/mark-on-dark.svg
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
