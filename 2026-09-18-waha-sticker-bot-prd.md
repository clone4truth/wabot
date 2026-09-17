# Product Requirements Document (PRD)

## WAHA Sticker Bot — V1

**Status:** Approved design / ready for implementation planning  
**Version:** 1.0  
**Date:** 18 September 2026  
**Architecture:** Modular monolith  
**WhatsApp gateway:** WAHA, single session  
**Runtime:** Node.js + TypeScript  

---

## 1. Ringkasan Produk

WAHA Sticker Bot adalah bot WhatsApp khusus pembuatan dan konversi stiker. Bot menerima command ber-prefix `!` dan dapat mengubah teks, reply teks, gambar, reply gambar, video, serta reply video menjadi stiker WhatsApp.

WAHA hanya berfungsi sebagai gateway WhatsApp. Seluruh logika command, resolusi reply, validasi input, pemrosesan media, rendering teks, rate limiting, dan pembuatan WebP berada di aplikasi Sticker Bot.

V1 difokuskan pada satu session WAHA, private chat dan group, open access dengan rate limiting, tanpa database, tanpa Redis, tanpa dashboard admin, tanpa AI image generation, dan tanpa multi-session.

---

## 2. Latar Belakang dan Masalah

Pembuatan stiker WhatsApp biasanya memerlukan aplikasi terpisah atau alur manual. Pengguna juga sering ingin mengubah pesan percakapan langsung menjadi stiker tanpa menyalin isi pesan terlebih dahulu.

Produk ini menyederhanakan alur tersebut menjadi command WhatsApp:

- reply pesan teks lalu `!stiker`;
- reply foto lalu `!stiker`;
- reply video lalu `!stiker`;
- kirim foto/video dengan caption `!stiker`;
- kirim `!stiker <teks>` untuk membuat stiker teks.

Semua bentuk input tersebut diproses melalui satu command utama dengan auto-detection.

---

## 3. Tujuan Produk

V1 harus:

1. Membuat stiker dengan interaksi sesingkat mungkin.
2. Mendukung teks, gambar, dan video melalui command yang konsisten.
3. Mendukung pesan yang direply tanpa meminta pengguna mengirim ulang konten.
4. Berjalan pada private chat dan group.
5. Aman untuk open access dengan rate limit dan validasi media.
6. Memisahkan Sticker Engine dari WAHA agar engine dapat digunakan kembali pada versi berikutnya.
7. Menyediakan struktur yang mudah ditingkatkan ke queue, Redis, database, dan multi-session tanpa rewrite besar.

### Success criteria V1

- Seluruh command inti dapat berjalan dari private chat dan group.
- Reply teks, gambar, dan video dapat di-resolve secara konsisten.
- Hasil sticker selalu berupa WebP yang valid untuk dikirim melalui WAHA.
- Unsupported input menghasilkan error yang jelas dan tidak membuat worker crash.
- Retry webhook yang sama tidak menghasilkan sticker ganda selama message ID masih berada dalam idempotency cache.
- Resource sementara dibersihkan setelah pemrosesan selesai atau gagal.

---

## 4. Non-Goals V1

Fitur berikut tidak termasuk V1:

- multi-session WAHA;
- SaaS/multi-tenant;
- database persisten;
- Redis/BullMQ;
- admin dashboard;
- AI image generation;
- AI auto-caption;
- background removal berbasis AI;
- user account/premium plan;
- custom sticker pack per user;
- analytics persisten;
- OCR;
- download media sosial;
- generic utility bot di luar domain sticker.

---

## 5. Target Pengguna

### 5.1 Private user
Pengguna WhatsApp yang ingin membuat sticker dengan command sederhana.

### 5.2 Group member
Anggota grup yang ingin mengubah pesan, foto, atau video di dalam grup menjadi sticker.

### 5.3 Bot operator
Pemilik WAHA dan Sticker Bot yang membutuhkan deployment sederhana, observability dasar, konfigurasi melalui environment variable, dan batas resource yang aman.

---

## 6. Prinsip Produk

### 6.1 Satu command utama
`!stiker` menjadi entry point utama dan mendeteksi tipe input secara otomatis.

### 6.2 Reply-first
Jika command mereply pesan lain, konten reply menjadi sumber utama.

### 6.3 Tidak ada pemrosesan diam-diam
Bot hanya memproses pesan yang merupakan command valid. Pesan biasa di private chat maupun group diabaikan.

### 6.4 Tidak memotong konten tanpa pemberitahuan
Input yang melewati limit ditolak. V1 tidak melakukan silent truncation terhadap teks atau silent trim terhadap video.

### 6.5 WAHA adalah transport, bukan business logic
WAHA menangani konektivitas WhatsApp. Sticker Bot menangani seluruh domain sticker.

---

## 7. Platform dan Stack

### Core

- Node.js
- TypeScript
- Fastify atau Express untuk HTTP webhook; implementasi memilih salah satu dan tidak menggunakan keduanya.
- Sharp untuk image processing dan static WebP.
- FFmpeg/ffprobe untuk video processing dan animated WebP.
- Pango/fontconfig atau text rendering backend yang tersedia melalui image stack untuk layout teks.

### Gateway

- WAHA single session.
- Webhook event `message` sebagai event utama pesan masuk.
- WAHA API client sebagai satu-satunya modul yang berkomunikasi langsung dengan endpoint WAHA.

### Persistence V1

Tidak ada database. State runtime terbatas pada:

- in-memory rate limit;
- short-lived idempotency cache;
- temporary processing files;
- application configuration.

---

## 8. Command Convention

Semua command menggunakan prefix:

```text
!
```

Command bersifat case-insensitive:

```text
!stiker
!STIKER
!Stiker
```

semuanya diperlakukan sebagai command yang sama.

Whitespace sebelum argumen dinormalisasi, tetapi pesan harus dimulai dengan prefix command setelah trimming yang diizinkan oleh parser.

---

## 9. Command V1

### 9.1 `!stiker`

Command utama untuk membuat sticker.

Didukung:

```text
!stiker
!stiker <teks>
!stiker full
!stiker crop
!stiker circle
!stiker quote
!stiker bubble
!stiker meme <atas> | <bawah>
!stiker teks <teks>
```

### 9.2 `!toimg`

Mengubah sticker static yang direply menjadi gambar.

Default output V1: PNG.

Animated sticker tidak diproses oleh `!toimg`; user diarahkan menggunakan `!togif`.

### 9.3 `!togif`

Mengubah animated sticker yang direply menjadi media bergerak yang dapat dikirim melalui WhatsApp.

Implementasi internal boleh menggunakan MP4 sebagai output transport jika lebih kompatibel daripada GIF, tetapi command publik tetap `!togif`.

### 9.4 `!menu`

Menampilkan daftar command ringkas beserta contoh penggunaan.

### 9.5 `!help`

Menampilkan bantuan penggunaan dan contoh untuk command utama.

### 9.6 `!ping`

Memastikan bot hidup dan memberi latency sederhana berdasarkan waktu request diproses.

---

## 10. Input Resolution

Urutan prioritas input harus deterministik.

### Priority 1 — Replied message

Jika command mereply pesan:

1. reply image → ImageStickerProcessor;
2. reply video → VideoStickerProcessor;
3. reply text → TextStickerProcessor;
4. reply sticker → hanya diproses oleh command konversi yang sesuai.

### Priority 2 — Current message media

Jika tidak ada reply:

1. current image + caption command → ImageStickerProcessor;
2. current video + caption command → VideoStickerProcessor.

### Priority 3 — Direct text

Jika tidak ada reply/media dan terdapat argumen teks:

```text
!stiker jangan lupa backup database
```

→ TextStickerProcessor.

### Ambiguity rule

Jika pesan merupakan reply, replied message adalah sumber konten utama.

Contoh:

```text
reply image
!stiker crop
```

`crop` adalah modifier.

Untuk memaksa kata reserved menjadi sticker teks:

```text
!stiker teks crop
```

menghasilkan sticker bertuliskan `crop`.

Reserved modifier V1:

- `full`
- `crop`
- `circle`
- `quote`
- `bubble`
- `meme`
- `teks`

---

## 11. Text Sticker Processor

### Input

- direct text melalui `!stiker <teks>`;
- reply text melalui `!stiker`;
- explicit text mode melalui `!stiker teks <teks>`.

### Default visual

- canvas maksimum 512 × 512;
- transparent background;
- bold sans-serif font;
- white text;
- black outline;
- center alignment;
- adaptive font size;
- automatic word wrapping;
- adaptive margin;
- Unicode support;
- emoji menggunakan font fallback yang tersedia.

### Adaptive sizing

Engine harus mencari ukuran font terbesar yang membuat seluruh teks muat pada safe area.

Tidak boleh:

- clipping yang disengaja;
- overflow keluar canvas;
- silent truncation.

### Text limit

Default maksimum: 300 Unicode characters.

Nilai harus configurable.

### Quote mode

Command:

```text
reply text
!stiker quote
```

Output menggunakan desain quote milik bot sendiri.

Data yang dapat dirender:

- sender display name jika tersedia;
- replied text;
- timestamp opsional.

V1 tidak wajib mengambil profile picture.

### Bubble mode

Command:

```text
reply text
!stiker bubble
```

Output menyerupai chat bubble generik milik produk, bukan screenshot atau clone pixel-perfect WhatsApp UI.

---

## 12. Image Sticker Processor

### Supported source

- JPEG;
- PNG;
- WebP static yang dapat didecode engine.

Actual file content harus divalidasi. Extension dan declared MIME tidak boleh menjadi satu-satunya dasar kepercayaan.

### Default mode

`!stiker` menggunakan behavior contain/full-ish untuk meminimalkan pemotongan bagian penting gambar.

### Full

```text
!stiker full
```

- seluruh gambar terlihat;
- preserve aspect ratio;
- area kosong transparan.

### Crop

```text
!stiker crop
```

- scale untuk memenuhi canvas;
- preserve aspect ratio;
- area di luar canvas dipotong.

### Circle

```text
!stiker circle
```

- square crop yang wajar;
- circular alpha mask;
- area di luar lingkaran transparan.

### Meme

```text
reply image
!stiker meme PUSH HARI JUMAT | APA YANG BISA SALAH?
```

Requirements:

- source harus berupa image;
- `|` memisahkan top dan bottom text;
- salah satu sisi boleh kosong;
- font size adaptive;
- readable outline;
- hasil akhir WebP.

---

## 13. Video Sticker Processor

### Input

Video dari current message atau reply.

### Default limits

- max input size: 20 MB;
- max duration: 10 detik;
- max output dimension: 512 × 512;
- audio dihapus;
- aspect ratio dipertahankan;
- output animated WebP.

### Processing pipeline

```text
Download
→ MIME/content validation
→ ffprobe
→ duration/size validation
→ decode
→ scale/fps optimization
→ animated WebP encode
→ result validation
```

Video yang melampaui durasi ditolak. V1 tidak melakukan silent auto-trim.

---

## 14. `!toimg` Processor

Input wajib berupa reply ke static sticker.

Pipeline:

```text
WebP sticker
→ decode
→ PNG
→ sendImage
```

Jika sticker animated, response memberi tahu user menggunakan `!togif`.

---

## 15. `!togif` Processor

Input wajib berupa reply ke animated sticker.

Pipeline:

```text
animated WebP
→ FFmpeg
→ compatible moving-media output
→ WAHA send media
```

Nama command tetap `!togif`; format transport boleh MP4 jika diperlukan untuk reliability WhatsApp.

---

## 16. Sticker Result Contract

Semua sticker processor menghasilkan contract internal yang sama:

```ts
interface StickerResult {
  buffer: Buffer;
  mimetype: 'image/webp';
  width: number;
  height: number;
  animated: boolean;
  size: number;
}
```

WAHAClient menerima `StickerResult` tanpa mengetahui apakah sumbernya teks, gambar, atau video.

---

## 17. Arsitektur

```text
WhatsApp
   ↓
WAHA
   ↓ message webhook
WebhookController
   ↓
WebhookVerifier
   ↓
MessageNormalizer
   ↓
IdempotencyGuard
   ↓
CommandParser
   ↓
RateLimiter
   ↓
CommandRouter
   ↓
InputResolver
   ├── TextStickerProcessor
   ├── ImageStickerProcessor
   ├── VideoStickerProcessor
   ├── ToImageProcessor
   └── ToGifProcessor
          ↓
     Result Contract
          ↓
       WAHAClient
          ↓
       WhatsApp
```

---

## 18. Component Responsibilities

### WebhookController

- menerima HTTP request dari WAHA;
- meneruskan request ke verifier;
- tidak berisi sticker processing logic.

### WebhookVerifier

- verifikasi HMAC webhook;
- reject invalid signature;
- memberlakukan body size limit.

### MessageNormalizer

Mengubah variasi payload WAHA menjadi internal model konsisten:

```ts
NormalizedMessage {
  eventId
  messageId
  chatId
  senderId
  participantId?
  isGroup
  fromMe
  body
  media?
  reply?
}
```

### IdempotencyGuard

- mencegah webhook retry diproses dua kali;
- menggunakan TTL cache in-memory pada V1.

### CommandParser

Menghasilkan:

```ts
ParsedCommand {
  name
  args
  rawArgs
}
```

### CommandRouter

Memetakan command ke handler tanpa menaruh logic media di router.

### InputResolver

Menentukan sumber actual berdasarkan prioritas reply → current media → direct text.

### StickerService

Facade untuk processor sticker.

### MediaDownloader

- hanya mengambil media dari source WAHA yang dipercaya;
- menerapkan timeout;
- stream/buffer limit;
- menolak unsupported scheme/host.

### WAHAClient

Satu-satunya adapter outbound ke WAHA.

Responsibilities:

- send sticker;
- send image/media hasil konversi;
- send text/help/error;
- reaction jika digunakan dan didukung pada deployment.

---

## 19. WAHA Integration Requirements

V1 menggunakan satu session bernama melalui configuration, default dapat berupa `default`.

### Incoming

Subscribe minimum ke event `message`.

Bot harus mengabaikan:

- `fromMe=true`;
- status/broadcast yang tidak didukung;
- pesan biasa tanpa command;
- unsupported media;
- duplicate event/message ID.

Payload reply menggunakan data reply yang diberikan WAHA. Jika media reply tidak memiliki downloadable URL karena media download dinonaktifkan atau gagal, bot memberikan error yang jelas dan tidak mencoba arbitrary fallback URL.

### Outgoing sticker

Sticker dikirim melalui WAHA dengan MIME `image/webp`. Sticker engine bertanggung jawab menghasilkan WebP valid sebelum WAHAClient dipanggil.

---

## 20. Group Behavior

Bot tersedia di private chat dan group.

### Group rules

- pesan biasa diabaikan;
- command valid diproses;
- reply target hanya diakses untuk memenuhi command aktif;
- per-user dan per-group rate limit berlaku;
- bot tidak menjalankan command yang berasal dari pesan bot sendiri.

V1 tidak memerlukan admin-only group mode.

---

## 21. Rate Limiting

Default configuration:

### Per user

8 command / 60 detik.

### Per group

30 command / 60 detik.

### Heavy processing

Maksimum 2 video processing aktif per user.

Rate limiter menggunakan interface:

```ts
interface RateLimiter {
  consume(key: string, cost?: number): Promise<RateLimitResult>;
}
```

V1 implementation: `MemoryRateLimiter`.

Future implementation: `RedisRateLimiter` tanpa mengubah consumers.

---

## 22. Input and Resource Limits

Default:

| Resource | Limit |
|---|---:|
| Text | 300 Unicode chars |
| Image input | 15 MB |
| Video input | 20 MB |
| Video duration | 10 seconds |
| Text processing timeout | 5 seconds |
| Image processing timeout | 10 seconds |
| Video processing timeout | 30 seconds |
| Sticker canvas | max 512 × 512 |
| Temporary file retention | max 5 minutes |

Seluruh limit harus berasal dari configuration/environment, bukan magic number tersebar.

---

## 23. Security Requirements

### 23.1 WAHA API exposure

WAHA tidak boleh diekspos tanpa proteksi ke jaringan publik. API key wajib diaktifkan pada deployment production.

### 23.2 Webhook authentication

Webhook WAHA → Sticker Bot wajib menggunakan HMAC pada production.

Invalid signature:

```text
→ reject
→ no command processing
```

### 23.3 SSRF protection

MediaDownloader tidak boleh menjadi generic URL fetcher.

Rules:

- allow only configured WAHA media origin/host;
- allow HTTP/HTTPS sesuai trusted deployment;
- reject `file://`;
- reject user-supplied arbitrary URL;
- jangan mengikuti redirect menuju untrusted host;
- enforce download size dan timeout.

### 23.4 File validation

- verify actual decodable content;
- inspect dimensions/duration sebelum heavy processing jika memungkinkan;
- reject malformed media;
- unique temporary filenames;
- no user filename used directly as local path.

### 23.5 Temporary data

- temp file dibuat dengan random identifier;
- dihapus dalam `finally` path;
- periodic orphan cleanup;
- maksimum retention 5 menit secara default.

### 23.6 Logging privacy

Production log tidak menyimpan isi pesan dan nomor telepon mentah secara default.

Identifier dapat di-hash untuk correlation.

---

## 24. Idempotency

WAHA webhook dapat mengalami retry. Bot harus mencegah duplicate side effects.

Key utama:

```text
session + message/event ID
```

State V1:

- in-memory TTL cache;
- TTL cukup untuk menutup webhook retry window yang relevan;
- cache size memiliki upper bound.

Jika duplicate ditemukan:

```text
acknowledge request
→ do not generate/send sticker again
```

---

## 25. Error Handling

User-facing error harus singkat dan tidak mengandung stack trace.

Contoh:

```text
❌ Teks maksimal 300 karakter.
❌ Ukuran gambar terlalu besar.
❌ Video maksimal 10 detik.
❌ Format media tidak didukung.
❌ Media dari pesan yang direply tidak tersedia.
❌ Reply teks, foto, video, atau sticker yang didukung.
⏳ Terlalu banyak permintaan. Coba lagi beberapa saat.
❌ Gagal membuat sticker.
```

Internal error memiliki stable error code, misalnya:

```text
INVALID_COMMAND
UNSUPPORTED_INPUT
TEXT_TOO_LONG
MEDIA_TOO_LARGE
VIDEO_TOO_LONG
MEDIA_DOWNLOAD_FAILED
MEDIA_DECODE_FAILED
PROCESSING_TIMEOUT
RATE_LIMITED
WAHA_SEND_FAILED
INVALID_WEBHOOK_SIGNATURE
```

---

## 26. Processing Feedback

V1 dapat memberikan status minimal:

```text
⏳ processing
✅ success
❌ failed
```

Prefer reaction jika adapter/engine yang digunakan mendukungnya dengan stabil; jika tidak, bot dapat menggunakan pesan singkat.

Feedback tidak boleh menghasilkan spam berlebihan di group.

---

## 27. Observability

Structured log minimum:

```text
requestId
session
messageIdHash
chatIdHash
command
processor
inputType
processingDurationMs
outputSize
success
errorCode
```

Tidak log default:

- raw phone number;
- raw message body;
- raw media binary;
- API key;
- HMAC secret.

Health endpoint aplikasi:

```text
GET /health
```

Minimum response menunjukkan process hidup. V1 tidak wajib menjadikan health endpoint sebagai deep WAHA connectivity test.

---

## 28. Configuration

Contoh kategori environment variable:

```text
APP_PORT
APP_ENV
LOG_LEVEL

WAHA_BASE_URL
WAHA_API_KEY
WAHA_SESSION
WAHA_WEBHOOK_HMAC_KEY

COMMAND_PREFIX=!

MAX_TEXT_LENGTH=300
MAX_IMAGE_BYTES
MAX_VIDEO_BYTES
MAX_VIDEO_DURATION_SECONDS=10

TEXT_PROCESSING_TIMEOUT_MS
IMAGE_PROCESSING_TIMEOUT_MS
VIDEO_PROCESSING_TIMEOUT_MS

USER_RATE_LIMIT
GROUP_RATE_LIMIT
VIDEO_CONCURRENCY_PER_USER

TEMP_DIR
TEMP_FILE_TTL_SECONDS
```

Secrets tidak boleh masuk source control.

---

## 29. Suggested Project Structure

```text
src/
├── app.ts
├── server.ts
├── config/
│   ├── env.ts
│   └── limits.ts
├── http/
│   ├── webhook.controller.ts
│   └── health.controller.ts
├── whatsapp/
│   ├── waha.client.ts
│   ├── webhook.verifier.ts
│   ├── message.normalizer.ts
│   └── types.ts
├── commands/
│   ├── parser.ts
│   ├── router.ts
│   ├── stiker.handler.ts
│   ├── toimg.handler.ts
│   ├── togif.handler.ts
│   ├── menu.handler.ts
│   ├── help.handler.ts
│   └── ping.handler.ts
├── stickers/
│   ├── sticker.service.ts
│   ├── input.resolver.ts
│   ├── result.ts
│   ├── processors/
│   │   ├── text.processor.ts
│   │   ├── image.processor.ts
│   │   ├── video.processor.ts
│   │   ├── meme.processor.ts
│   │   ├── quote.processor.ts
│   │   └── bubble.processor.ts
│   └── rendering/
│       ├── text-layout.ts
│       └── fonts.ts
├── media/
│   ├── downloader.ts
│   ├── validator.ts
│   ├── ffmpeg.ts
│   └── temp-files.ts
├── security/
│   ├── rate-limiter.ts
│   ├── memory-rate-limiter.ts
│   └── idempotency.ts
├── errors/
│   ├── app-error.ts
│   └── error-codes.ts
└── observability/
    └── logger.ts

tests/
├── unit/
├── integration/
├── fixtures/
└── e2e/
```

Files harus tetap kecil dan berfokus pada satu responsibility. Handler tidak boleh berisi implementasi Sharp/FFmpeg langsung.

---

## 30. Testing Requirements

### 30.1 Unit tests

Wajib mencakup:

- prefix parsing;
- case-insensitive command;
- command args;
- reserved modifier parsing;
- reply precedence;
- direct media resolution;
- direct text resolution;
- text length validation;
- rate limiter;
- idempotency cache;
- host allowlist/SSRF validation;
- error mapping.

### 30.2 Processor tests

Fixtures minimal:

- short text;
- long text near limit;
- Unicode;
- emoji;
- portrait JPEG;
- landscape JPEG;
- transparent PNG;
- short MP4;
- malformed media;
- static WebP;
- animated WebP.

Assertions:

- output dapat didecode;
- MIME sesuai;
- dimensions valid;
- alpha sesuai pada circle/full;
- animated result benar untuk video;
- timeout/error path cleanup temp file.

### 30.3 Integration tests

Mock WAHA:

- incoming direct text command;
- reply text;
- direct image;
- reply image;
- direct video;
- reply video;
- duplicate webhook;
- invalid HMAC;
- missing `media.url`;
- WAHA send failure.

### 30.4 E2E smoke test

Menggunakan satu test session WAHA:

```text
!ping
!menu
!stiker hello
reply text + !stiker
image + !stiker
reply image + !stiker crop
reply text + !stiker quote
short video + !stiker
reply static sticker + !toimg
reply animated sticker + !togif
```

Test dilakukan pada private chat dan setidaknya satu group.

---

## 31. Acceptance Criteria

V1 dianggap selesai jika:

1. `!stiker <teks>` menghasilkan text sticker valid.
2. reply text + `!stiker` menghasilkan sticker dari replied text.
3. image + caption `!stiker` menghasilkan image sticker.
4. reply image + `!stiker` menghasilkan image sticker.
5. video + `!stiker` menghasilkan animated sticker selama memenuhi limit.
6. reply video + `!stiker` berhasil.
7. `full`, `crop`, dan `circle` bekerja sesuai definisi.
8. `quote`, `bubble`, dan `meme` menghasilkan output valid.
9. `!toimg` bekerja pada static sticker.
10. `!togif` bekerja pada animated sticker.
11. `!menu`, `!help`, dan `!ping` bekerja.
12. Private chat dan group didukung.
13. Non-command message tidak menghasilkan response.
14. Rate limit bekerja per user dan group.
15. Invalid webhook signature tidak diproses.
16. Duplicate webhook tidak mengirim output dua kali.
17. Oversized/unsupported media ditolak sebelum expensive processing jika memungkinkan.
18. Temporary files dibersihkan pada success dan failure.
19. Production logs tidak membocorkan secrets atau raw message content secara default.
20. Semua required automated tests lulus.

---

## 32. Delivery Milestones

### Milestone 1 — Foundation

- Node.js + TypeScript bootstrap;
- config validation;
- health endpoint;
- WAHA client;
- webhook verification;
- message normalizer;
- command parser/router.

### Milestone 2 — Text Sticker

- direct text;
- reply text;
- adaptive layout;
- Unicode/emoji fallback;
- quote;
- bubble.

### Milestone 3 — Image Sticker

- media downloader;
- validation;
- default/full/crop/circle;
- meme.

### Milestone 4 — Video Sticker

- ffprobe validation;
- FFmpeg conversion;
- animated WebP;
- limits/timeouts.

### Milestone 5 — Conversion Utilities

- `!toimg`;
- `!togif`.

### Milestone 6 — Protection and Reliability

- rate limiting;
- idempotency;
- temp cleanup;
- privacy-safe structured logging;
- standardized errors.

### Milestone 7 — E2E and Release

- real WAHA smoke test;
- private + group test;
- deployment configuration;
- production hardening validation.

---

## 33. Future Roadmap

### V1.1

Potential improvements:

- more text styles;
- custom fonts;
- sticker metadata/pack name if supported by chosen encoding flow;
- better emoji renderer;
- configurable admin/allowlist mode;
- background removal.

### V2

- Redis;
- BullMQ/background workers;
- horizontal media processing workers;
- persistent analytics;
- admin configuration;
- custom per-group settings.

### V3

- multi-session WAHA;
- tenant isolation;
- SaaS/API mode;
- quotas;
- usage dashboard;
- billing-ready architecture.

AI image generation tetap merupakan fitur terpisah dan tidak menjadi dependency Sticker Engine dasar.

---

## 34. Final Architecture Decision Record

Keputusan V1 yang dikunci:

```text
Product            WAHA Sticker Bot
Architecture       Modular monolith
WAHA               Single session
Channel            Private + Group
Access             Open access
Command prefix      !
Primary command     !stiker
Core inputs         Text / Image / Video
Reply inputs        Text / Image / Video
Utilities           !toimg / !togif
System commands     !menu / !help / !ping
Image engine        Sharp
Video engine        FFmpeg
Sticker format      WebP
Database            None
Redis               None
Queue               None
Security            HMAC + API key + rate limit + SSRF protection
Idempotency         In-memory TTL cache
Deployment target   Single application instance + WAHA for V1
```

---

## 35. External Constraints Verified for This PRD

As of 18 September 2026, the WAHA documentation used for this design confirms the following integration assumptions:

- WAHA exposes `POST /api/sendSticker`.
- Sticker input to that endpoint must already be WebP; PNG/JPEG are not automatically converted.
- Incoming `message` events can include `replyTo` information for replied messages.
- Incoming/replied media can expose `media.url` when WAHA media download is enabled and successful.
- WAHA supports HMAC authentication for webhook verification.
- Production configuration should subscribe only to required webhook events rather than all events.

Reference set: WAHA “Send messages”, “Receive messages”, “Events”, “Security”, and “Configuration” documentation, checked 18 September 2026.

---

## 36. Definition of Ready for Implementation Planning

PRD V1 is ready for implementation planning when the product owner approves this document without unresolved functional or architectural decisions.

The next artifact after approval is a task-level implementation plan with test-first checkpoints. No production code should be started from this PRD until that plan is approved.
