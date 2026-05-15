# ============================================================
# Stage 1: Dependencies
# ============================================================
FROM node:24-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig*.json ./
RUN npx prisma generate

# ============================================================
# Stage 2: Build
# ============================================================
FROM node:24-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .

RUN npm run build

# ============================================================
# Stage 3: Production
# ============================================================
FROM node:24-alpine AS prod

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./

EXPOSE 8080

CMD ["node", "dist/main.js"]
