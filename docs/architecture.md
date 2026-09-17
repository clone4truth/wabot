# WAHA Sticker Bot — Architecture Document

## Overview

WAHA Sticker Bot adalah bot WhatsApp berbasis modular monolith untuk pembuatan dan konversi stiker. WAHA berfungsi sebagai gateway transportasi, sedangkan Sticker Bot menangani seluruh domain logika sticker.

## Stack

- **Runtime**: Node.js 22 + TypeScript
- **Web Framework**: Fastify 5.x
- **Image Processing**: Sharp 0.33.x
- **Video Processing**: FFmpeg + fluent-ffmpeg
- **Text Rendering**: Sharp Pango integration
- **WhatsApp Gateway**: WAHA (self-hosted REST API)
- **HTTP Client**: node-fetch

## Architecture Flow

```
WhatsApp → WAHA → Webhook → WebhookVerifier → MessageNormalizer
→ IdempotencyGuard → CommandParser → RateLimiter → CommandRouter
→ InputResolver → StickerProcessor → Result → WAHAClient → WhatsApp
```

## Component Responsibilities

### Layer 1: HTTP & Gateway
- **WebhookController**: Menerima request WAHA, meneruskan ke verifier
- **HealthController**: Health check endpoint

### Layer 2: WhatsApp Integration
- **WAHAClient**: Adapter outbound ke WAHA API (sendSticker, sendImage, sendText)
- **WebhookVerifier**: HMAC signature verification, body size validation
- **MessageNormalizer**: Mengubah payload WAHA menjadi NormalizedMessage

### Layer 3: Security
- **MemoryRateLimiter**: In-memory rate limiting per user/group
- **IdempotencyGuard**: TTL cache untuk mencegah duplicate webhook processing
- **SSRF Protection**: Host allowlist pada MediaDownloader

### Layer 4: Core Business Logic
- **StickerService**: Facade untuk semua sticker processors
- **InputResolver**: Menentukan sumber input berdasarkan priority (reply → media → text)
- **CommandParser**: Parsing command prefix dan argument
- **CommandRouter**: Mapping command ke handler

### Layer 5: Processors
- **TextStickerProcessor**: Sticker teks dengan Pango rendering
- **ImageStickerProcessor**: Image → WebP (full/crop/circle/meme)
- **VideoStickerProcessor**: Video → Animated WebP
- **MemeProcessor**: Image dengan teks atas/bawah
- **QuoteProcessor**: Desain quote card
- **BubbleProcessor**: Chat bubble style
- **ToImageProcessor**: Static sticker → PNG
- **ToGifProcessor**: Animated sticker → MP4

### Layer 6: Media
- **MediaDownloader**: Download media dari WAHA dengan SSRF protection
- **Validator**: MIME signature, file size, content validation
- **FFmpeg**: Video metadata, conversion to animated WebP
- **TempFiles**: Create, cleanup, orphan cleanup

### Layer 7: Rendering
- **TextLayout**: Pango-based text rendering with Sharp composite
- **Fonts**: Font fallback system

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
