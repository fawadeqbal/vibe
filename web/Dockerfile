# Vibe Web — Next.js standalone server.
# NEXT_PUBLIC_* values are inlined at build time: pass them as build args.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_VIBE_API
ARG NEXT_PUBLIC_SITE_URL="https://vibe.fawadiqbal.dev"
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ARG NEXT_PUBLIC_DEV_SIGN_IN="false"
ENV NEXT_PUBLIC_VIBE_API=$NEXT_PUBLIC_VIBE_API NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID NEXT_PUBLIC_DEV_SIGN_IN=$NEXT_PUBLIC_DEV_SIGN_IN NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3002 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER app
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3002/welcome >/dev/null || exit 1
CMD ["node", "server.js"]
