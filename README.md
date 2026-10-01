# WAHA Sticker Bot — WhatsApp Sticker Studio

Bot WhatsApp modular untuk pembuatan dan konversi stiker tingkat lanjut menggunakan WAHA (WhatsApp HTTP API), Sharp, FFmpeg, dan Bounded Job Management.

## Fitur Unggulan

- **Generator Platform Modular**: Arsitektur plugin berbasis `GeneratorRegistry` tanpa god-class `switch/case`.
- **Image Effect Engine**: Efek visual non-destruktif (`!stiker blur`, `grayscale`, `sepia`, `invert`, `pixel`, `sharpen`, `shadow`).
- **Creative Tools Studio**:
  - `!stiker removebg` — Hapus background foto menjadi transparan.
  - `!stiker subject` — Smart crop otomatis memfokuskan objek utama dengan padding aman.
  - `!stiker outline` — Beri garis tepi stiker (`white`, `black`, `gold`).
  - `!stiker caption` — Tambahkan caption banner atas, bawah, atau overlay pada foto.
  - `!stiker template` — Template kartu visual SVG (`terminal`, `breaking`, `wanted`, `minimal`).
  - `!emoji` — Render emoji besar 1–4 grapheme cluster tanpa clipping/tofu.
  - `!badge` — Stiker badge status bergaya modern (`ONLINE`, `OFFLINE`, `LIVE`, `ERROR`, `SUCCESS`).
- **Advanced TTP & ATTP**:
  - `!ttp style <preset> <teks>` — Preset: `gradient`, `minimal`, `dark`, `terminal`, `gold`, `neon`.
  - `!attp effect <preset> <teks>` — Animasi multi-frame WebP: `rainbow`, `fade`, `zoom`, `blink`, `slide`, `bounce`.
- **In-Process Bounded Job Management**: Alokasi kuota konkurensi global (`MAX_IMAGE_JOBS`, `MAX_VIDEO_JOBS`, `MAX_ANIMATION_JOBS`, `MAX_BACKGROUND_JOBS`) dengan isolasi status per pengguna via `!job`.
- **Konversi Media**:
  - `!toimg` — Konversi stiker statis ke gambar PNG.
  - `!togif` — Konversi stiker bergerak ke video MP4 H.264.
- **Keamanan & Privasi**: HMAC webhook, exact-origin SSRF protection, bounded temp cleanup, rate limiting, and zero sensitive chat logging.
- **Safe Avatar Fetching**: Foto profil diambil via endpoint WAHA terdokumentasi (`GET /api/{session}/chats/{chatId}/picture`, field respons `url`) lalu diunduh dengan `SafeExternalImageFetcher`: HTTPS-only, validasi DNS publik + IP pinning, TLS SNI hostname asli, redirect re-validasi, byte/pixel cap, MIME + format raster tervalidasi Sharp — tanpa penerusan kredensial.
- **Dashboard Admin** (Vue 3 + shadcn-vue, disajikan di `/dashboard`): monitoring resource & antrean job, log realtime, pembatalan job, edit limit/throttle runtime, prefix per chat, access control, restart/purge. Login password + session cookie HttpOnly.

Untuk dokumentasi lengkap perintah dan arsitektur, lihat:
- [Panduan Command](docs/commands.md)
- [Dashboard Admin](dashboard/README.md)
- [Arsitektur Generator System](docs/generator-system.md)
- [Dokumen Arsitektur Monolith](docs/architecture.md)

## Keamanan & Standar Operasional

- **Webhook HMAC mandatory**: jika `WAHA_WEBHOOK_HMAC_KEY` diisi, request tanpa/tanda tangan salah ditolak (403). Kosongkan hanya untuk development.
- **Privacy logging**: log production hanya berisi hash identifier (tanpa nomor/isi pesan mentah).
- **Dashboard auth-gated**: `/dashboard` + seluruh `/api/admin/*` (kecuali `/login` dan `/session`) butuh session cookie. Dashboard mati total bila `ADMIN_PASSWORD` kosong. Route lama `/api/logs` tanpa auth sudah dihapus.
- **`/health` & `/ready` tetap publik** minimal — `/health` tidak menyebut WAHA, `/ready` menyembunyikan URL internal di production.
- **Rate limit**: 8/menit per user DAN 30/menit per grup (berlaku bersamaan di grup). Bisa diubah dari dashboard tanpa restart.
- **Media**: tanpa cache persisten — download → proses → kirim → hapus (maks 5 menit). Media hanya diambil dari exact `WAHA_BASE_URL` origin (termasuk redirect).
- **Akses default**: open access (private + group). Opsional: `ALLOWED_CHAT_IDS`, `BLOCKED_SENDER_IDS`, `GROUP_ADMIN_ONLY`.

## Instalasi

```bash
# Clone repo
git clone <repo-url>
cd waha-sticker-bot

# Install dependencies
npm install

# Copy env
cp .env.example .env
# Edit .env dengan config WAHA Anda

# Build
npm run build

# Jalankan
npm start

# Atau development
npm run dev
```

### Setup GitHub

```bash
# Inisialisasi git (sudah dilakukan jika dari awal)
git init
git branch -M main
git add -A
git commit -m "Initial commit: WAHA Sticker Bot V1"

# Buat repository di GitHub, lalu push
git remote add origin https://github.com/<username>/waha-sticker-bot.git
git push -u origin main
```

## Requirements

- Node.js 22.12+ (backend dan dashboard)
- FFmpeg (dengan encoder libx264 dan libwebp)
- fontconfig + ttf-dejavu + font-noto + font-noto-emoji
- WAHA server

## Resource Tuning (penting untuk VPS kecil)

Bawaan library bisa membuat bot melampaui kapasitas VPS. Nilai berikut sudah
di-tuning di dalam kode dan bisa diubah lewat environment:

| Setting | Default | Alasan |
|---|---|---|
| `SHARP_CONCURRENCY` | `1` | Default Sharp = jumlah CPU core. Pada Alpine (musl) nilainya **tidak** diklem ke 1, sehingga 4 job image × N core = kelebihan thread. |
| `SHARP_CACHE_FILES` | `0` | Default Sharp menahan 20 file descriptor di cache libvips selama umur proses. |
| `SHARP_CACHE_MEMORY_MB` | `16` | Default Sharp 50 MB. |
| `MAX_INPUT_PIXELS` | `25000000` | Default Sharp 268 juta piksel (~1,07 GB RGBA per gambar). Download membatasi byte, bukan piksel. |
| `UV_THREADPOOL_SIZE` | `1` | Set di Dockerfile; default libuv 4 thread. |
| `MALLOC_ARENA_MAX` | `2` | Set di Dockerfile; kurangi fragmentasi RSS. |
| `mem_limit` / `cpus` / `pids_limit` | `768m` / `1.5` / `256` | Di `docker-compose.yml`. Tanpa batas, lonjakan sharp/ffmpeg membuat kernel OOM-kill seluruh host. |

## Deployment

```bash
docker build -t waha-sticker-bot .
docker-compose up -d
```

## Project Structure

```
src/
├── app.ts              # Fastify app initialization
├── server.ts           # Entry point
├── config/             # Environment, limits, runtime config (dashboard)
├── http/               # Webhook, health, admin API, static SPA
├── whatsapp/           # WAHA client, verifier, normalizer
├── commands/           # Command parser, router, handlers, metadata
├── stickers/           # Sticker service, processors, rendering, jobs
├── media/              # Downloader, validator, ffmpeg, temp files, sharp runtime
├── security/           # Rate limiter, idempotency, access guard, admin auth
├── errors/             # App errors & error codes
└── observability/      # Logger + privacy hashing

dashboard/               # Vue 3 + Vite + Tailwind v4 + shadcn-vue SPA
dashboard-dist/          # Hasil build (di-gitignore, di-copy ke image)
```

## Dashboard Admin

```bash
cd dashboard
npm install
npm run build    # output ke ../dashboard-dist, disajikan Fastify di /dashboard
```

Aktif dengan set `ADMIN_PASSWORD` di `.env` (kosong = dashboard mati).
Lihat [dashboard/README.md](dashboard/README.md) untuk detail stack, autentikasi,
dan halaman yang tersedia, termasuk koneksi WhatsApp lewat QR.
Untuk membuat sesi baru dari dashboard, set `WAHA_BOT_WEBHOOK_URL` ke URL
`/webhooks` bot yang dapat dijangkau WAHA; sesi lama mempertahankan webhook-nya.
Build backend dan dashboard sekaligus dengan `npm run build:all`.

## License

MIT
