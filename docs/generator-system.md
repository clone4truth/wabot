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
- `LocalBackgroundRemovalProvider`: Pemisahan latar belakang berbasis sampel warna pojok dan jarak warna pada RGBA lokal tanpa dependensi cloud.
- `ApiBackgroundRemovalProvider`: Menghubungi endpoint API eksternal yang dikonfigurasi melalui variabel lingkungan (`BACKGROUND_REMOVAL_API_URL`), terlindungi dari SSRF (URL tidak dikontrol user).

Fitur turunan:
- **Subject Smart Crop**: Menganalisis kanal alpha untuk menentukan kotak pembatas (bounding box) objek utama, menambahkan padding aman 10–15%, dan memusatkan objek pada kanvas 512×512.
- **Outline**: Mendilatasi boundary kanal alpha (`blur` + `threshold`), memberi lapisan warna latar (`white`, `black`, `gold`), lalu mengomposisikan subjek asli di atasnya.

---

## 5. In-Process Bounded Job Manager

Lokasi: `src/stickers/jobs/job-manager.ts`

Mengontrol alokasi sumber daya prosesor dan memori tanpa dependensi eksternal seperti Redis/BullMQ:
- **Image Queue**: Maksimal `MAX_IMAGE_JOBS` konkuren (default: 4).
- **Video Queue**: Maksimal `MAX_VIDEO_JOBS` konkuren (default: 2).
- **Animation Queue**: Maksimal `MAX_ANIMATION_JOBS` konkuren (default: 2).
- **Background Queue**: Maksimal `MAX_BACKGROUND_JOBS` konkuren (default: 1).
- **Privasi & Isolasi**: Pengecekan status job (`!job`) hanya menampilkan antrean milik pengirim bersangkutan (`ownerHash`).
