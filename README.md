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

Untuk dokumentasi lengkap perintah dan arsitektur, lihat:
- [Panduan Command](file:///home/seno/Project/stikerbot/docs/commands.md)
- [Arsitektur Generator System](file:///home/seno/Project/stikerbot/docs/generator-system.md)
- [Dokumen Arsitektur Monolith](file:///home/seno/Project/stikerbot/docs/architecture.md)

## Keamanan & Standar Operasional

- **Webhook HMAC mandatory**: jika `WAHA_WEBHOOK_HMAC_KEY` diisi, request tanpa/tanda tangan salah ditolak (403). Kosongkan hanya untuk development.
- **Privacy logging**: log production hanya berisi hash identifier (tanpa nomor/isi pesan mentah).
- **Dashboard & `/api/logs`**: aktif hanya di non-production. `/health` publik minimal, `/ready` untuk status WAHA.
- **Rate limit**: 8/menit per user DAN 30/menit per grup (berlaku bersamaan di grup).
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

- Node.js >= 20
- FFmpeg (dengan encoder libx264 dan libwebp)
- fontconfig + ttf-dejavu + font-noto + font-noto-emoji
- WAHA server

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
├── config/             # Environment & limits configuration
├── http/               # Webhook & health controllers
├── whatsapp/           # WAHA client, verifier, normalizer
├── commands/           # Command parser, router, handlers
├── stickers/           # Sticker service, processors, rendering
├── media/              # Downloader, validator, ffmpeg, temp files
├── security/           # Rate limiter, idempotency
├── errors/             # App errors & error codes
└── observability/      # Logger
```

## License

MIT
