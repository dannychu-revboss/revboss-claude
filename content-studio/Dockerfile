# RevBoss Content Studio — single-container deploy (Railway / Fly.io / Render)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="file:/data/studio.db"
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL="file:/data/studio.db"
ENV PORT=3000

# Prisma CLI is needed at boot to sync the schema (prisma db push)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p /data

EXPOSE 3000
VOLUME /data
CMD ["./docker-entrypoint.sh"]
