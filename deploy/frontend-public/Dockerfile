FROM nginxinc/nginx-unprivileged:1.31.2-alpine3.23@sha256:6320020c7da8714feab524e02c08c5a1958675c4e68700e93a2fd8970b065786

USER root

RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/* \
    && chown -R 101:101 /usr/share/nginx/html /etc/nginx/conf.d

COPY --chown=101:101 dist/target/public-index.html /usr/share/nginx/html/public-index.html
COPY --chown=101:101 dist/target/public-login.html /usr/share/nginx/html/public-login.html
COPY --chown=101:101 deploy/helm/versorgungs-kompass/files/frontend-public.conf /etc/nginx/conf.d/default.conf

RUN test "$(find /usr/share/nginx/html -mindepth 1 -maxdepth 1 -type f | wc -l | tr -d ' ')" = "2" \
    && grep -Fq 'data-public-entry="home"' /usr/share/nginx/html/public-index.html \
    && grep -Fq 'data-public-entry="access"' /usr/share/nginx/html/public-login.html \
    && nginx -t

USER 101:101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
