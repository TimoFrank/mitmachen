FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS node-runtime

WORKDIR /build
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

FROM gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.22.0@sha256:fa4c7308245407157c5e9c4e16f1c0f1113899d6f29dc8f8be3e30efae86467f AS cloud-sql-proxy

FROM gcr.io/google.com/cloudsdktool/google-cloud-cli:569.0.0-slim@sha256:a443f0233e9476f41db019f2b4f07bb6d72dace55aa2b176deefeb6205a2a83a

LABEL org.opencontainers.image.title="Versorgungs-Kompass pre-gematik access operator" \
      org.opencontainers.image.description="Short-lived, in-cluster identity and guest-access runner; not an application runtime"

WORKDIR /workspace

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /build/node_modules ./node_modules
COPY --from=cloud-sql-proxy /cloud-sql-proxy /usr/local/bin/cloud-sql-proxy

COPY scripts/check_pre_gematik_migration_gcp.mjs ./scripts/check_pre_gematik_migration_gcp.mjs
COPY scripts/provision_iap_identity_bindings.mjs ./scripts/provision_iap_identity_bindings.mjs
COPY scripts/provision_pre_gematik_identity_platform_account.mjs ./scripts/provision_pre_gematik_identity_platform_account.mjs
COPY scripts/provision_pre_gematik_identity_platform_guest_access.mjs ./scripts/provision_pre_gematik_identity_platform_guest_access.mjs
COPY scripts/provision_pre_gematik_test_access.mjs ./scripts/provision_pre_gematik_test_access.mjs
COPY scripts/lib/cloud-sql-managed-proxy.mjs ./scripts/lib/cloud-sql-managed-proxy.mjs
COPY scripts/lib/target-database-connection.mjs ./scripts/lib/target-database-connection.mjs
COPY deploy/migration-operator/operator-entrypoint.mjs /opt/operator/operator-entrypoint.mjs

ENV NODE_ENV=production \
    HOME=/tmp/home \
    CLOUDSDK_CONFIG=/tmp/gcloud \
    CLOUDSDK_CORE_DISABLE_PROMPTS=1 \
    CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK=1

USER 65532:65532

ENTRYPOINT ["node", "/opt/operator/operator-entrypoint.mjs"]
