# WAHA Sticker Bot — Generator System Architecture

Dokumen ini menjelaskan arsitektur generator modular, registry, dan bounded job management.

---

## 1. Generator Plugin Interface

Setiap generator mengimplementasikan interface `StickerGenerator`:

```typescript
export interface GeneratorContext {
  chatId: string;
  senderId: string;
  senderName?: string;
  session?: string;
  wahaClient?: any;
}

export interface GeneratorInput {
  type: string;
  modifier?: string;
  text?: string;
  mediaUrl?: string;
  mimetype?: string;
  options?: Record<string, unknown>;
  content?: Record<string, unknown>;
}

export interface StickerGenerator {
  readonly name: string;
  supports(input: GeneratorInput): boolean;
  validate(input: GeneratorInput, context: GeneratorContext): Promise<void> | void;
  process(input: GeneratorInput, context: GeneratorContext): Promise<ProcessingResult>;
}
```

---

## 2. Generator Registry

Lokasi: `src/stickers/generators/registry.ts`

- **Deterministik**: Mencegah registrasi nama ganda.
- **Resolusi Berurutan**: Generator terspesialisasi (`CaptionGenerator`, `RemoveBgGenerator`, `TemplateGenerator`, `EmojiGenerator`, `BadgeGenerator`, `TtpGenerator`, `AttpGenerator`, `MemeGenerator`) diuji terlebih dahulu sebelum fallback umum (`TextGenerator`, `ImageGenerator`).
- **Ekstensibel**: Plugin pihak ketiga dapat diregistrasikan tanpa mengubah baris kode `StickerService`.

---

## 3. Image Effect Engine

Lokasi: `src/stickers/effects/`

`EffectRegistry` mengelola efek visual berbasis Sharp. Setiap efek menerapkan contract `ImageEffect`:
- `blur`: Gaussian blur terkontrol
- `grayscale`: Konversi kanal luma
- `sepia`: Modulasi matriks warna vintage
- `invert`: Inversi kanal RGB
- `pixel`: Downscale resolusi rendah lalu upscale nearest-neighbor ke 512×512
- `sharpen`: Unsharp mask presisi tinggi
- `shadow`: Drop shadow layer di bawah gambar transparan

---

## 4. Background Removal Provider Abstraction

Lokasi: `src/stickers/background-removal/`

Arsitektur swappable melalui interface `BackgroundRemovalProvider`:
- `DisabledBackgroundRemovalProvider`: Menolak dengan aman (`FEATURE_DISABLED`) jika belum diaktifkan.
- `LocalBackgroundRemovalProvider`: Basic local background removal berbasis sampel warna pojok dan jarak warna RGBA; optimal untuk latar belakang sederhana atau mendekati seragam.
- `ApiBackgroundRemovalProvider`: Menghubungi endpoint API eksternal yang dikonfigurasi melalui variabel lingkungan (`BACKGROUND_REMOVAL_API_URL`), terlindungi dari SSRF (URL tidak dikontrol user) dengan batas payload streaming (`BACKGROUND_REMOVAL_MAX_RESPONSE_BYTES`).

Fitur turunan:
- **Subject Smart Crop**: Menganalisis kanal alpha untuk menentukan kotak pembatas (bounding box) objek utama, menambahkan padding aman 10–15%, dan memusatkan objek pada kanvas 512×512.
- **Outline**: Mendilatasi boundary kanal alpha (`blur` + `threshold`), memberi lapisan warna latar (`white`, `black`, `gold`), lalu mengomposisikan subjek asli di atasnya.

---

## 5. In-Process Bounded Job Manager

Lokasi: `src/stickers/jobs/job-manager.ts`

Mengontrol alokasi sumber daya prosesor dan memori secara strictly bounded tanpa dependensi eksternal:
- **Concurrency Limits**: `MAX_IMAGE_JOBS` (4), `MAX_VIDEO_JOBS` (2), `MAX_ANIMATION_JOBS` (2), `MAX_BACKGROUND_JOBS` (1).
- **Bounded Queues**: `MAX_IMAGE_QUEUE` (50), `MAX_VIDEO_QUEUE` (20), `MAX_ANIMATION_QUEUE` (20), `MAX_BACKGROUND_QUEUE` (10). Overflow langsung ditolak (`JOB_QUEUE_FULL`).
- **Queue Wait Timeout & Cancellation**: Waktu tunggu antrean diperhitungkan dalam deadline total; job yang dibatalkan saat masih `QUEUED` tidak akan pernah dieksekusi.
- **Privasi & Isolasi**: Metadata job hanya menyimpan `ownerHash = hashIdentifier(senderId)` sehingga nomor atau identitas pribadi pengirim tidak pernah tersimpan di memori.
- **History Pruning**: Menyimpan maksimal 200 job yang sudah selesai dengan kebijakan eviksi oldest-first dan TTL pruning (`JOB_HISTORY_TTL_SECONDS`).

---

## 6. Batch Foundation

`BatchStickerService` (`src/stickers/batch/batch.service.ts`) dirancang sebagai fondasi internal untuk pemrosesan batch stiker secara terkoordinasi melalui `JobManager`. Perintah WhatsApp user-facing (`!stiker batch`) sengaja belum diaktifkan hingga format payload album dari WAHA didukung secara penuh dan stabil.
