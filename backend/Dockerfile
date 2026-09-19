FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build
RUN npm prune --production

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY migrations ./migrations
EXPOSE 4000
# Production-safe default: run idempotent migrations (IF NOT EXISTS, safe to
# re-run; skips gracefully when the DB is unreachable) then start the API.
# The server binds 0.0.0.0 and honors Render's PORT (see src/index.ts).
# Docker Compose overrides this command explicitly, so local behavior is unchanged.
CMD ["sh", "-c", "npm run migrate:prod && node dist/index.js"]
