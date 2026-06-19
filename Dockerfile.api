FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY api/ ./api/

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "api/server.mjs"]
