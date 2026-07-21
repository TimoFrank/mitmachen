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
COPY frontend/data/activity-model.js ./frontend/data/activity-model.js
COPY frontend/data/sector-registry.js ./frontend/data/sector-registry.js

ENV NODE_ENV=production \
    PORT=8080
EXPOSE 8080

USER node

CMD ["node", "api/server.mjs"]
