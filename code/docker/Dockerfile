FROM node:24-bookworm AS dependencies

WORKDIR /workspace
COPY code/package.json code/package-lock.json ./code/
RUN npm ci --prefix code

FROM dependencies AS builder

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --prefix code

FROM dependencies AS production-dependencies

# better-auth's optional peer currently targets better-sqlite3 v12 while this
# application intentionally uses v13; match code/.npmrc during production prune.
RUN npm prune --omit=dev --legacy-peer-deps --prefix code

FROM node:24-bookworm-slim AS runner

WORKDIR /app
ARG APP_VERSION=development
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV STATE_DATABASE_PATH=/data/state/learning-state.sqlite
ENV APP_VERSION=${APP_VERSION}

COPY code/package.json code/package-lock.json ./code/
COPY --from=production-dependencies /workspace/code/node_modules ./code/node_modules
COPY --from=builder /workspace/code/.next ./code/.next
COPY --from=builder /workspace/code/content ./code/content

RUN mkdir -p /data/state
WORKDIR /app/code
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]
