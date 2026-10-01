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

# ---- Dashboard SPA (Vue 3 + Vite + shadcn-vue) ----
FROM node:22-alpine AS dashboard-builder

WORKDIR /app

COPY dashboard/package*.json ./dashboard/
RUN cd dashboard && npm ci

COPY dashboard ./dashboard
RUN cd dashboard && npm run build   # output -> /dashboard-dist

FROM node:22-alpine AS runtime

RUN apk add --no-cache \
    ffmpeg \
    fontconfig \
    ttf-dejavu \
    font-noto \
    font-noto-emoji \
    && fc-cache -f

WORKDIR /app

# Wajib diset SEBELUM proses Node start (hanya dibaca saat boot libuv).
# Default libuv = 4 thread; itu menambah 4 OS thread yang bisa idle tapi tetap
# menambah pressure scheduler pada VPS kecil.
ENV UV_THREADPOOL_SIZE=1
# Batasi jumlah memory pool glibc untuk kurangi fragmentasi RSS.
ENV MALLOC_ARENA_MAX=2

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=dashboard-builder /dashboard-dist ./dashboard-dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
