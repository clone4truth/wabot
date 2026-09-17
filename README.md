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
| `!toimg` | Konversi sticker static ke gambar |
| `!togif` | Konversi animated sticker ke video |
| `!menu` | Daftar command |
| `!help` | Bantuan |
| `!ping` | Cek status bot |

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
- fontconfig + fonts (DejaVu Sans Bold)
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
