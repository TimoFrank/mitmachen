FROM caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d

COPY deploy/single-server/caddy/Caddyfile /etc/caddy/Caddyfile
COPY dist/target/public-index.html /srv/public/public-index.html
COPY dist/target/public/media/social/mitmachen-share-v3.png /srv/public/public/media/social/mitmachen-share-v3.png

ARG PRODUCT_VERSION
ARG SOURCE_REVISION
ARG SOURCE_URL

RUN APP_HOST=validation.invalid APP_SITE_ADDRESS=validation.invalid \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
    && test -f /srv/public/public-index.html \
    && test -f /srv/public/public/media/social/mitmachen-share-v3.png \
    && grep -Fq 'data-public-entry="home"' /srv/public/public-index.html \
    && printf '%s' "$PRODUCT_VERSION" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
    && printf '%s' "$SOURCE_REVISION" | grep -Eq '^[0-9a-fA-F]{40,64}$' \
    && printf '%s' "$SOURCE_URL" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~%+-]+)+$'

LABEL org.opencontainers.image.title="Versorgungs-Kompass Einzelserver Gateway" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="$SOURCE_URL" \
      org.opencontainers.image.revision="$SOURCE_REVISION" \
      org.opencontainers.image.version="$PRODUCT_VERSION"
