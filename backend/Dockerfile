# ── build ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ── run ──────────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S vibe && adduser -S vibe -G vibe
# Media on disk (STORAGE_DRIVER=local, or files from before the switch to s3):
# the app runs as `vibe` and /app is owned by root, so the upload folders must
# exist and belong to `vibe`, or uploads fail with EACCES (500). Mount volumes here.
RUN mkdir -p /app/uploads /app/uploads-private && chown vibe:vibe /app/uploads /app/uploads-private
COPY --from=build --chown=vibe:vibe /app/node_modules ./node_modules
COPY --from=build --chown=vibe:vibe /app/dist ./dist
COPY --from=build --chown=vibe:vibe /app/prisma ./prisma
COPY --chown=vibe:vibe package.json ./
USER vibe
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1
# Apply pending migrations, then start. (Run migrations as a separate job when scaling out.)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
