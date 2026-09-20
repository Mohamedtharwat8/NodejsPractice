# API image. Build with `--target migrate` for the one-shot migration/seed image.
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

# Runs `prisma migrate deploy` (needs the Prisma CLI, a dev dependency) and the seed scripts.
FROM build AS migrate
COPY src ./src
CMD ["npx", "prisma", "migrate", "deploy"]

FROM build AS prod-deps
RUN npm prune --omit=dev

FROM node:22-alpine AS api
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
COPY packages ./packages
COPY src ./src
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "src/server.js"]

# Both microservices share the API's source (models, relay, worker), so they build from the repo root.
FROM api AS ai-service
ENV AI_SERVICE_PORT=4010
COPY services/ai-service ./services/ai-service
EXPOSE 4010
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD wget -qO- http://127.0.0.1:4010/health || exit 1
CMD ["node", "services/ai-service/index.js"]

FROM api AS notification-service
ENV NOTIFICATION_SERVICE_PORT=4020
COPY services/notification-service ./services/notification-service
EXPOSE 4020
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD wget -qO- http://127.0.0.1:4020/health || exit 1
CMD ["node", "services/notification-service/index.js"]
