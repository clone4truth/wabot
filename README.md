# WAHA Sticker Bot

Bot WhatsApp untuk pembuatan dan konversi stiker menggunakan WAHA (WhatsApp HTTP API).

## Fitur

- Buat stiker dari teks, gambar, dan video
- Reply pesan lalu `!stiker` untuk mengubahnya jadi stiker
- `!toimg` - Konversi sticker static ke gambar PNG
- `!togif` - Konversi animated sticker ke video MP4
- Rate limiting per user dan group
- Idempotency webhook untuk mencegah duplicate
- HMAC webhook verification
- SSRF protection
- Privacy-safe structured logging

## Command

| Command | Deskripsi |
|---------|-----------|
| `!stiker <teks>` | Buat stiker teks |
| `!stiker full` | Stiker image (full) |
| `!stiker crop` | Stiker image (crop) |
| `!stiker circle` | Stiker image (circle) |
| `!stiker quote` | Stiker quote |
| `!stiker bubble` | Stiker bubble |
| `!stiker meme <atas> \| <bawah>` | Stiker meme |
| `!stiker teks <teks>` | Paksa mode teks |
| `!ttp <teks>` | Stiker teks gradien (ekstensi V1.1) |
| `!attp <teks>` | Stiker teks animasi (ekstensi V1.1) |
| `!prefix [simbol]` | Lihat/ubah prefix chat ini (ekstensi) |
| `!toimg` | Konversi sticker static ke gambar |
| `!togif` | Konversi animated sticker ke video (dikirim sebagai MP4) |
| `!menu` | Daftar command |
| `!help` | Bantuan |
| `!ping` | Cek status bot |

## Keamanan & Perilaku V1

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
- FFmpeg
- fontconfig + ttf-dejavu
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
