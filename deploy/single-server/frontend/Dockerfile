FROM nginxinc/nginx-unprivileged:1.31.2-alpine3.23@sha256:6320020c7da8714feab524e02c08c5a1958675c4e68700e93a2fd8970b065786

USER root

RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/* \
    && chown -R 101:101 /usr/share/nginx/html /etc/nginx/conf.d

COPY --chown=101:101 dist/target/ /usr/share/nginx/html/
COPY --chown=101:101 deploy/single-server/frontend/00-privacy.conf /etc/nginx/conf.d/00-privacy.conf
COPY --chown=101:101 deploy/helm/versorgungs-kompass/files/frontend-default.conf /etc/nginx/conf.d/default.conf

ARG PRODUCT_VERSION
ARG SOURCE_REVISION
ARG SOURCE_URL

RUN test -f /usr/share/nginx/html/versorgungs-kompass.html \
    && test -f /usr/share/nginx/html/data/runtime-config.js \
    && test -z "$(find /usr/share/nginx/html -type l -print -quit)" \
    && grep -Fq 'dataMode: "api"' /usr/share/nginx/html/data/runtime-config.js \
    && grep -Fq 'authMode: "oidc"' /usr/share/nginx/html/data/runtime-config.js \
    && grep -Fq 'authGateway: "oauth2-proxy"' /usr/share/nginx/html/data/runtime-config.js \
    && grep -Fq 'requireApiGateway: true' /usr/share/nginx/html/data/runtime-config.js \
    && grep -Fqx 'access_log off;' /etc/nginx/conf.d/00-privacy.conf \
    && ! grep -R -Fq 'REPLACE_WITH_' /usr/share/nginx/html \
    && nginx -t \
    && chown 101:101 /tmp/nginx.pid \
    && printf '%s' "$PRODUCT_VERSION" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
    && printf '%s' "$SOURCE_REVISION" | grep -Eq '^[0-9a-fA-F]{40,64}$' \
    && printf '%s' "$SOURCE_URL" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~%+-]+)+$'

LABEL org.opencontainers.image.title="Versorgungs-Kompass Einzelserver Frontend" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="$SOURCE_URL" \
      org.opencontainers.image.revision="$SOURCE_REVISION" \
      org.opencontainers.image.version="$PRODUCT_VERSION"

USER 101:101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
