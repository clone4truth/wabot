# WAHA Sticker Bot — Architecture Document

## Overview

WAHA Sticker Bot adalah bot WhatsApp berbasis modular monolith untuk pembuatan dan konversi stiker. WAHA berfungsi sebagai gateway transportasi, sedangkan Sticker Bot menangani seluruh domain logika sticker.

## Stack

- **Runtime**: Node.js 22 + TypeScript
- **Web Framework**: Fastify 5.x
- **Image Processing**: Sharp 0.33.x
- **Video Processing**: FFmpeg (standardized child process runner dengan deadline timeout, termination confirmation, dan ffprobe metadata validation)
- **Text Rendering**: SVG text rendering via Sharp (presisi px; Pango tidak dipakai karena unit font tak terprediksi)
- **WhatsApp Gateway**: WAHA (self-hosted REST API)
- **HTTP Client**: node-fetch

## Architecture Flow

```
WhatsApp → WAHA → Webhook → WebhookVerifier → MessageNormalizer
→ AccessGuard → CommandParser → IdempotencyGuard.tryStart (atomic)
→ RateLimiter (user + group) → CommandRouter
→ InputResolver → StickerProcessor → Result (+EXIF pack) → WAHAClient → WhatsApp
```

## Component Responsibilities

### Layer 1: HTTP & Gateway
- **WebhookController**: Menerima request WAHA, memverifikasi signature, routing command, dan mengelola state idempotency/rate limit
- **HealthController**: Health check endpoint

### Layer 2: WhatsApp Integration
- **WAHAClient**: Adapter outbound ke WAHA API:
  - `sendSticker`: `POST /api/sendSticker`
  - `sendImage`: `POST /api/sendImage`
  - `sendVideo`: `POST /api/sendVideo` (`convert: false`)
  - `sendText`: `POST /api/sendText`
  - `sendReaction`: `PUT /api/reaction` (body: `session`, `messageId`, `reaction`)
- **WebhookVerifier**: HMAC signature verification, body size validation
- **MessageNormalizer**: Mengubah payload WAHA menjadi NormalizedMessage

### Layer 3: Security
- **MemoryRateLimiter**: In-memory rate limiting per user (8/mnt) + per group (30/mnt)
- **IdempotencyGuard**: In-memory TTL cache dengan atomic `tryStart(key)` (state PROCESSING/DONE)
- **SSRF Protection**: Exact WAHA origin allowlist + validasi redirect pada MediaDownloader

### Layer 4: Core Business Logic
- **StickerService**: Facade untuk semua sticker processors; concurrency slot release terikat pada terminasi proses sebenarnya
- **InputResolver**: Menentukan sumber input berdasarkan priority (reply → media → text)
- **CommandParser**: Parsing command prefix dan argument
- **CommandRouter**: Mapping command ke handler

### Layer 5: Processors
- **TextStickerProcessor**: Plain sticker teks dengan SVG + Sharp rendering
- **ImageStickerProcessor**: Image → WebP (full/crop/circle)
- **VideoStickerProcessor**: Video → Animated WebP (H.264/WebP, single deadline ownership)
- **MemeProcessor**: Image dengan teks atas/bawah
- **QuoteProcessor**: Desain quote card
- **BubbleProcessor**: Chat bubble style
- **ToImageProcessor**: Static sticker → PNG
- **ToGifProcessor**: Animated sticker → MP4 (H.264/libx264, yuv420p, +faststart, ffprobe codec validation)
- **TtpProcessor**: Text-to-Picture sticker dengan gradien
- **AttpProcessor**: Animated Text-to-Picture sticker dengan frame pelangi

### Layer 6: Media
- **MediaDownloader**: Download media dari exact WAHA origin (redirect tervalidasi), size cap streaming
- **Validator**: MIME signature, file size, content validation
- **FFmpeg**: Video metadata, standardized runner dengan timeout dan graceful SIGKILL
- **TempFiles**: Create, cleanup, orphan cleanup

### Layer 7: Rendering
- **TextLayout**: SVG text rendering + outline paint-order + adaptive fitted sizing dengan validasi 2-level (logical layout bounds + actual rendered pixel trim bounds).
- **TextUtils**: Grapheme-safe Unicode processing via `Intl.Segmenter` (cluster-safe counting, slicing, dan word-wrapping tanpa silent truncation). Batas teks ditegakkan berdasarkan user-perceived characters (grapheme clusters), bukan raw UTF-16 code units.
- **Fonts**: DejaVu + Noto + Noto Emoji (fontconfig fallback)

## Configuration

Semua konfigurasi melalui environment variables di `.env`:
- WAHA connection (URL, API key, session)
- Rate limits (per user, per group)
- Resource limits (text, image, video)
- Processing timeouts
- Temp file management

## Error Handling

- `AppError` dengan stable `ErrorCode`
- User-facing messages dalam Bahasa Indonesia
- Internal error codes untuk correlation
- Structured JSON logging (tanpa raw phone numbers/messages)

## Testing

- **Unit Tests**: Parser, rate limiter, idempotency, validator, error codes
- **Integration Tests**: Mock WAHA webhook scenarios
- **E2E Tests**: Real WAHA session testing

## Milestones

1. Foundation (config, WAHA client, webhook, parser/router)
2. Text Sticker
3. Image Sticker
4. Video Sticker
5. Conversion Utilities (!toimg, !togif)
6. Protection (rate limit, idempotency, cleanup, logging)
7. E2E & Release
