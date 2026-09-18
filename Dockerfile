FROM node:22-alpine AS builder

RUN apk add --no-cache \
    ffmpeg \
    fontconfig \
    ttf-dejavu \
    font-noto \
    font-noto-emoji \
    && fc-cache -f

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY vitest.config.ts ./
RUN npm ci

COPY src ./src
COPY tests ./tests
RUN npm run build

FROM node:22-alpine AS runtime

RUN apk add --no-cache \
    ffmpeg \
    fontconfig \
    ttf-dejavu \
    font-noto \
    font-noto-emoji \
    && fc-cache -f

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
