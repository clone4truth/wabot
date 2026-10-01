# Dashboard admin

Vue 3 + Vite + Tailwind CSS v4 + shadcn-vue (Reka UI). Layout diadaptasi dari
[block resmi dashboard-01](https://shadcn-vue.com/blocks#dashboard-01):
`SidebarProvider`, `AppSidebar`, `SidebarInset`, dan `SiteHeader`. Navigasi dan isi
block disesuaikan dengan data bot; data contoh dan grafik fiktif tidak digunakan.
Komponen UI dihasilkan dari registry shadcn-vue, dengan satu library ikon `@lucide/vue`.

## Menjalankan

Gunakan Node.js 22.12+ agar sesuai dengan engine Vite yang terpasang.

Dari root project:

```bash
npm ci
npm ci --prefix dashboard
npm run build:all
npm start
```

Buka `/dashboard/`. Set `ADMIN_PASSWORD` di `.env` untuk mengaktifkan login.
Untuk development, jalankan backend dan Vite pada dua terminal:

```bash
# Terminal 1; port ini sesuai dengan proxy dashboard
APP_PORT=3010 npm run dev

# Terminal 2
npm run dashboard:dev
```

Buka `http://localhost:5173/dashboard/`. Untuk backend di port lain:
`DASHBOARD_API_TARGET=http://127.0.0.1:3000 npm run dashboard:dev`.

Build dashboard tersimpan di `dashboard-dist/`, disajikan Fastify di `/dashboard/`.
`DASHBOARD_DIST` dapat mengganti lokasi output yang dibaca server. Setelah memperbarui
backend, build dan restart proses/container agar route API baru tersedia.

## Menghubungkan WhatsApp

Konfigurasi backend (tidak memakai variabel `VITE_*`):

```dotenv
ADMIN_PASSWORD=isi-password-admin
WAHA_BASE_URL=http://waha:3000
WAHA_API_KEY=isi-api-key-waha
WAHA_SESSION=default
WAHA_WEBHOOK_HMAC_KEY=isi-kunci-hmac-webhook
WAHA_BOT_WEBHOOK_URL=http://sticker-bot:3000/webhooks
```

URL di atas merupakan contoh jaringan Docker. `WAHA_BASE_URL` harus dapat diakses
bot; `WAHA_BOT_WEBHOOK_URL` harus dapat diakses WAHA. Di server terpisah, gunakan URL
HTTPS bot Anda dengan path `/webhooks`. Jangan memakai `localhost` untuk merujuk
container lain. Compose project ini tidak membuat server WAHA; sediakan WAHA sendiri.

1. Login ke dashboard, buka **WhatsApp**, lalu pilih **Hubungkan WhatsApp**.
2. Sesi yang belum ada dibuat dengan webhook `message`, konfigurasi retry, dan kunci
   HMAC dari backend. `WAHA_BOT_WEBHOOK_URL` wajib valid untuk pembuatan sesi baru.
3. Sesi `STOPPED` dimulai; sesi `FAILED` direstart. Sesi yang sedang berjalan tidak
   dibuat ulang dan konfigurasi webhook sesi lama tidak ditimpa.
4. Di ponsel: WhatsApp → **Perangkat tertaut** → **Tautkan perangkat**, lalu pindai QR.
5. QR diambil ulang selama `SCAN_QR_CODE`. Ketika status `WORKING`, QR hilang dan
   informasi akun tampil. Kirim perintah stiker dari WhatsApp untuk memeriksa webhook.

**Jeda koneksi** mempertahankan autentikasi. **Keluar dari WhatsApp** menghapusnya
sehingga pemindaian QR diperlukan lagi; keduanya memerlukan konfirmasi di UI.
Restart sesi WhatsApp berbeda dari restart proses bot di halaman Pemeliharaan.
Jika WAHA mengembalikan status passkey, ikuti petunjuk dashboard bawaan WAHA; flow
passkey/WebAuthn tidak diimplementasikan oleh dashboard bot ini.

Sesi lama perlu memiliki webhook `/webhooks` dan HMAC yang cocok. Status **Terhubung**
menunjukkan koneksi akun WAHA, bukan verifikasi bahwa webhook sesi lama sudah benar.
Lihat [dokumentasi sesi WAHA](https://waha.devlike.pro/docs/how-to/sessions/).

## Halaman

| Route | Isi |
|---|---|
| `/login` | Login admin |
| `/` | Status WhatsApp, antrean dan aktivitas stiker |
| `/whatsapp` | Hubungkan sesi, QR, informasi akun, restart, stop, logout |
| `/jobs` | Statistik, daftar dan pembatalan job `QUEUED` |
| `/logs` | Filter level dan pencarian log |
| `/commands` | Registry perintah bot dan pencarian |
| `/access` | Prefix per chat dan daftar izin |
| `/config` | Limit runtime, akses dan reset konfigurasi |
| `/maintenance` | File sementara, pesan tes, restart bot dan pencabutan login |

## Autentikasi dan polling

- Cookie admin `HttpOnly`, `SameSite=Strict`, `Secure` saat production; production
  membutuhkan HTTPS. Token login disimpan server-side selama 12 jam.
- Login dibatasi 5 percobaan per 60 detik per IP + user-agent.
- Semua route WhatsApp berada di scope admin yang memerlukan login. API key dan
  session config WAHA (HMAC, proxy, headers) tidak dikirim ke browser.
- QR dan status diberi `Cache-Control: no-store`.
- Polling menggunakan satu request aktif, exponential backoff maksimum 60 detik,
  jeda saat tab tersembunyi, dan abort saat unmount/stop. Data lama dipertahankan
  saat refresh gagal dengan error yang terlihat; QR disembunyikan jika status gagal
  diperbarui. Operasi sesi membuang QR sebelumnya.
- Respons admin `401` menghentikan polling dan mengarahkan kembali ke login.
  Respons WAHA `401/403` dipetakan ke `502` agar tidak menghapus login admin.

## Struktur dan pengujian

```text
src/
├── assets/main.css          Token tema shadcn dan sidebar
├── components/
│   ├── layout/              AppSidebar, SiteHeader (dashboard-01)
│   ├── app/                 PageHeader, DataError, StatCard, SectionCard, WhatsappSummary
│   └── ui/                  Primitive dari registry shadcn-vue
├── composables/             use-auth, use-polling, use-whatsapp
├── lib/                     API dan tipe, navigasi, presentasi status
├── pages/                   Route views yang dimuat lazy
└── router/                  Guard login dan base /dashboard
```

Dari root, setelah dependency backend dan dashboard terpasang:

```bash
npm run typecheck
npm run build:all
npm test
```

`tests/integration/whatsapp-admin.test.ts` menggunakan simulator HTTP WAHA lokal
untuk menguji endpoint lifecycle, QR, HMAC, gating admin, redaksi secret, dan timeout.
`tests/unit/dashboard-polling.test.ts` menggunakan lifecycle renderer Vue untuk
memeriksa backoff, cleanup, stale response, tab tersembunyi, dan invalidasi login.
CI dan quality gate CD juga menginstal dependency dan membangun dashboard.
Pengujian simulasi tidak menggantikan scan QR dengan akun WhatsApp nyata.

## Tema dan bahasa dashboard

Menu tema di header dan halaman masuk menyediakan **Terang**, **Gelap**, dan
**Ikuti perangkat**. Mengikuti pola [dark mode Vite shadcn-vue](https://shadcn-vue.com/docs/dark-mode/vite),
`useColorMode` dari VueUse menyimpan pilihan di `stikerbot-theme`, mengikuti perubahan
preferensi perangkat, dan menerapkan kelas `.dark`. Bootstrap sebelum render mencegah
kedipan tema saat refresh. Toast, dialog, sidebar dan formulir memakai token tema yang sama.

Tampilan memakai bahasa pengguna; URL layanan, engine, status internal, hash dan
pesan mentah server tidak dirender. Detail diagnostik tetap tersedia melalui API dan
log backend. Riwayat aktivitas menampilkan ringkasan aman dari log yang tersedia,
bukan laporan audit lengkap. Ukuran media tampil dalam MB (1 MB = 1.048.576 byte).
Formulir menyimpan hanya nilai yang berubah agar batas pemrosesan tersembunyi tetap utuh.
Nomor telepon dikonversi ke format WhatsApp saat dikirim; entri grup lama tetap
dipertahankan dan ditampilkan dengan label anonim. Dashboard belum mengambil nama
grup/kontak sehingga penambahan baru lewat formulir nomor berlaku untuk percakapan pribadi.
