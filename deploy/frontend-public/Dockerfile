FROM nginxinc/nginx-unprivileged:1.31.2-alpine3.23@sha256:6320020c7da8714feab524e02c08c5a1958675c4e68700e93a2fd8970b065786

USER root

RUN apk del --no-network curl libcurl \
    && rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/* \
    && chown -R 101:101 /usr/share/nginx/html /etc/nginx/conf.d

COPY --chown=101:101 dist/target/public-index.html /usr/share/nginx/html/public-index.html
COPY --chown=101:101 dist/target/public/auth/index.html /usr/share/nginx/html/public/auth/index.html
COPY --chown=101:101 dist/target/public/auth/konto/passwort-festlegen/index.html /usr/share/nginx/html/public/auth/konto/passwort-festlegen/index.html
COPY --chown=101:101 dist/target/public/auth/portal-config.js /usr/share/nginx/html/public/auth/portal-config.js
COPY --chown=101:101 dist/target/public/auth/assets/app.js /usr/share/nginx/html/public/auth/assets/app.js
COPY --chown=101:101 dist/target/public/auth/assets/app.css /usr/share/nginx/html/public/auth/assets/app.css
COPY --chown=101:101 dist/target/public/auth/assets/action.js /usr/share/nginx/html/public/auth/assets/action.js
COPY --chown=101:101 dist/target/public/auth/assets/action.css /usr/share/nginx/html/public/auth/assets/action.css
COPY --chown=101:101 dist/target/public/auth/brand/versorgungs-kompass.svg /usr/share/nginx/html/public/auth/brand/versorgungs-kompass.svg
COPY --chown=101:101 dist/target/public/media/social/mitmachen-share-v3.png /usr/share/nginx/html/public/media/social/mitmachen-share-v3.png
COPY --chown=101:101 deploy/helm/versorgungs-kompass/files/frontend-public.conf /etc/nginx/conf.d/default.conf

RUN test "$(find /usr/share/nginx/html -mindepth 1 -maxdepth 1 -type f | wc -l | tr -d ' ')" = "1" \
    && test "$(find /usr/share/nginx/html -type f | wc -l | tr -d ' ')" = "10" \
    && test "$(find /usr/share/nginx/html/public/auth -type f | wc -l | tr -d ' ')" = "8" \
    && test -z "$(find /usr/share/nginx/html -type l -print -quit)" \
    && test -f /usr/share/nginx/html/public/media/social/mitmachen-share-v3.png \
    && grep -Fq 'data-public-entry="home"' /usr/share/nginx/html/public-index.html \
    && grep -Fq 'property="og:image"' /usr/share/nginx/html/public-index.html \
    && grep -Fq 'data-public-login-button' /usr/share/nginx/html/public-index.html \
    && grep -Fq 'data-identity-portal="signin"' /usr/share/nginx/html/public/auth/index.html \
    && grep -Fq 'data-identity-portal="password"' /usr/share/nginx/html/public/auth/konto/passwort-festlegen/index.html \
    && grep -Fq 'enableLocalPreview: false' /usr/share/nginx/html/public/auth/portal-config.js \
    && ! grep -R -Fq 'REPLACE_WITH_' /usr/share/nginx/html/public/auth \
    && nginx -t \
    && chown 101:101 /tmp/nginx.pid

USER 101:101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
