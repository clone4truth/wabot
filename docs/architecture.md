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
→ InputResolver → StickerService (Facade)
→ GeneratorRegistry → StickerGenerator
  ├── TextGenerator
  ├── ImageGenerator (+ EffectRegistry)
  ├── VideoGenerator
  ├── MemeGenerator
  ├── TtpGenerator (+ TextStyleRegistry)
  ├── AttpGenerator (+ AnimationRegistry)
  ├── TemplateGenerator (+ TemplateRegistry)
  ├── EmojiGenerator
  ├── BadgeGenerator
  ├── CaptionGenerator
  ├── RemoveBgGenerator (+ BackgroundRemovalService)
  ├── ToImageGenerator
  └── ToGifGenerator
→ JobManager (image, video, animation, background queues)
→ Media Pipeline (Sharp / FFmpeg)
→ Result (+EXIF pack) → WAHAClient → WhatsApp
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

### Layer 3: Security & Job Management
- **MemoryRateLimiter**: In-memory rate limiting per user (8/mnt) + per group (30/mnt)
- **IdempotencyGuard**: In-memory TTL cache dengan atomic `tryStart(key)` (state PROCESSING/DONE)
- **JobManager**: In-process bounded queue manager dengan kuota konkurensi global terisolasi (`MAX_IMAGE_JOBS`, `MAX_VIDEO_JOBS`, `MAX_ANIMATION_JOBS`, `MAX_BACKGROUND_JOBS`) serta isolasi state per pengguna. **JobManager adalah pemilik SATU-SATUNYA kendali konkurensi background job** — BackgroundRemovalService tidak memiliki konkurensi terpisah.
- **Total Deadline (end-to-end)**:
  ```
  Request accepted
  → JobManager deadline mulai (total budget)
  → Queue wait mengonsumsi deadline
  → Generator menerima sisa budget (remainingTimeoutMs + signal)
  → Child process (ffmpeg/ffprobe) menerima sisa budget — bukan budget baru
  → Late success ditolak: task yang resolve setelah deadline tetap
    FAILED (PROCESSING_TIMEOUT), bukan DONE
  ```
  Konvensi status: timeout saat masih `QUEUED` → `CANCELLED`; timeout saat `PROCESSING` → `FAILED` + `errorCode = PROCESSING_TIMEOUT`.
- **Child Process Cancellation**: Runner `runChildProcess` menerima `AbortSignal`; saat abort/timeout child di-SIGKILL dan Promise hanya settle setelah exit terkonfirmasi (invariant slot accounting).
- **SSRF Protection**: Exact WAHA origin allowlist + validasi redirect pada MediaDownloader

### Layer 4: Generator Platform & Registries
- **StickerService**: Facade orchestrator yang mendelegasikan eksekusi stiker ke `GeneratorRegistry` dan `JobManager`.
- **GeneratorRegistry**: Plugin registry deterministik untuk `StickerGenerator` tanpa silent fallback.
- **EffectRegistry**: Engine efek gambar non-destruktif Sharp (`blur`, `grayscale`, `sepia`, `invert`, `pixel`, `sharpen`, `shadow`).
- **TemplateRegistry**: Template card engine berbasis SVG (`terminal`, `breaking`, `wanted`, `minimal`).
- **TextStyleRegistry**: Preset gaya visual teks adaptif untuk TTP (`gradient`, `minimal`, `dark`, `terminal`, `gold`, `neon`).
- **AnimationRegistry**: Preset animasi berbingkai SVG untuk ATTP (`rainbow`, `fade`, `zoom`, `blink`, `slide`, `bounce`).
- **BackgroundRemovalService**: Abstraksi provider background removal swappable (`disabled`, `local`, `api`). Konkurensi dikendalikan penuh oleh JobManager via `MAX_BACKGROUND_JOBS` (tidak ada variabel konkurensi terpisah).

### Layer 5: Creative Tools
- **EmojiGenerator**: Render emoji besar 1-4 grapheme dengan fallback font aman tanpa tofu/clipping.
- **BadgeGenerator**: Badge status server/grup WhatsApp modern (`ONLINE`, `OFFLINE`, `LIVE`, `ERROR`, `SUCCESS`).
- **CaptionGenerator**: Image captioning adaptif (`top`, `bottom`, `overlay`).
- **BatchStickerService**: Pondasi pemrosesan multi-media dengan konkurensi terkendali dan ordering terjamin.

### Layer 6: Media & Rendering
- **MediaDownloader**: Download media dari exact WAHA origin (redirect tervalidasi), size cap streaming
- **Validator**: MIME signature, file size, content validation
- **FFmpeg**: Video metadata, standardized runner dengan timeout dan graceful SIGKILL
- **TempFiles**: Create, cleanup, orphan cleanup
- **TextLayout & TextUtils**: Grapheme cluster handling via `Intl.Segmenter` dan adaptive font fitting dua tahap — Stage 1 logical wrap, Stage 2 **validasi bounds piksel render aktual** (trim box via Sharp) sehingga CJK/emoji/wide-glyph tidak pernah terpotong. Template `terminal` mengikutsertakan prefix prompt (`user@wabot:~$ `, `> `) dalam pengukuran.
- **SafeExternalImageFetcher**: Fetcher avatar SSRF-hardened dengan dependency injection (lookup/request) untuk test deterministik: HTTPS-only, tolak credentials, port 443 saja, DNS policy *resolve-all → discard non-public → wajib ≥1 publik → pin satu IP publik tervalidasi*, TLS SNI = hostname asli, Host header = hostname asli, TLS verification aktif, redirect ≤3 dengan re-validasi penuh, byte cap, MIME allowlist (jpeg/png/webp), validasi format aktual via Sharp, pixel limit, tanpa penerusan kredensial (X-Api-Key/Authorization/Cookie).
