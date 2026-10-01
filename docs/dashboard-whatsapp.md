# Dashboard dan integrasi sesi WhatsApp

Perubahan 2026-10-01 sesuai rancangan yang disetujui: pertahankan Vue/Vite dan
Fastify yang sudah ada, adaptasi block shadcn-vue dashboard-01, tambahkan lifecycle
sesi WhatsApp melalui API admin, dan rapikan state/polling.

## Batas modul

- `dashboard/src/components/layout/`: sidebar dan header; navigasi ditentukan oleh
  `lib/navigation.ts`. Route views tidak menangani shell global.
- `dashboard/src/components/app/`: pola header, error, ringkasan dan card reusable
  yang dibangun dari primitive shadcn-vue.
- `use-polling.ts`: lifecycle, abort, backoff, request tunggal dan tab visibility.
- `use-whatsapp.ts`: status + QR, operasi sesi, invalidasi QR dan feedback UI.
- `waha-session.client.ts`: request HTTP lifecycle ber-timeout dan ber-batas body;
  terpisah dari adapter pengiriman pesan agar perilaku kirim stiker tetap stabil.
- `whatsapp.routes.ts`: route admin, pemilihan aksi connect, proyeksi DTO, respons
  error upstream dan penolakan mutation bersamaan.

## Kontrak API admin

Semua endpoint berikut memerlukan cookie admin dan mengembalikan `no-store`:

| Method | Endpoint | Perilaku |
|---|---|---|
| GET | `/api/admin/whatsapp` | Status sesi yang dikonfigurasi server; 404 upstream menjadi MISSING |
| GET | `/api/admin/whatsapp/qr` | PNG data URL ketika SCAN_QR_CODE; selain itu 409 |
| POST | `/api/admin/whatsapp/start` | Tombol Mulai sesi: create jika belum ada, start STOPPED, restart FAILED; idempotent untuk sesi berjalan |
| POST | `/api/admin/whatsapp/connect` | Alias kompatibilitas untuk `/start` |
| POST | `/api/admin/whatsapp/restart` | Restart sesi WAHA |
| POST | `/api/admin/whatsapp/stop` | Stop tanpa menghapus autentikasi |
| POST | `/api/admin/whatsapp/logout` | Menghapus autentikasi; tidak menghapus konfigurasi sesi |

Browser tidak dapat memilih host WAHA atau nama sesi lewat payload. Config WAHA
mentah tidak diproyeksikan. Error upstream tidak dipantulkan mentah. `502` menandai
kegagalan WAHA, `401` menandai login admin invalid, dan `409` menandai sesi/state
atau operasi yang belum siap. Pembuatan sesi baru memerlukan
`WAHA_BOT_WEBHOOK_URL`, dengan kunci HMAC diambil dari environment backend.

## Pembatasan request WAHA

Halaman WhatsApp dan ringkasan tidak menjalankan polling WAHA atau meminta status
saat mount. Mulai sesi dan Perbarui adalah aksi manual. Sesudah aksi sesi berhasil,
dashboard membaca status sekali dan mengambil QR hanya jika SCAN_QR_CODE. Jika sesi
masih STARTING, QR kedaluwarsa, atau akun selesai dipindai, pengguna memilih Perbarui.
Navigasi ke tab lain, error, dan idle tidak memulai request baru secara otomatis.

Backend berbagi satu request status yang masih berjalan, lalu menyimpan hasil atau
kegagalan selama 15 detik. QR memakai aturan yang sama dan menggunakan pemeriksaan
status bersama, sehingga 20 refresh QR serentak cukup dengan satu pemeriksaan sesi
dan satu pengambilan QR. Cache hanya dibaca saat ada request; tidak ada timer
background. Mutasi sesi yang berhasil menghapus kedua cache agar QR lama tidak
dipakai kembali. Operasi identik dari beberapa tab dibatasi 15 detik dengan 429
dan Retry-After; `/connect` berbagi batas yang sama dengan `/start`. Aksi lain,
seperti stop setelah start, tetap dapat dijalankan.

## Verifikasi

Jalankan typecheck backend, build Vue/backend, dan seluruh suite Vitest. Periksa
browser desktop/mobile untuk login, seluruh route, sidebar, QR, status WORKING,
stop/logout confirmation, save/reset config, dan redirect saat login dicabut.
Pemeriksaan browser memakai instance bot terisolasi dan simulator WAHA lokal,
bukan akun WhatsApp pengguna. Penautan nyata tetap memerlukan pemindaian QR.

## Referensi

- https://shadcn-vue.com/blocks#dashboard-01
- https://shadcn-vue.com/docs/components/sidebar
- https://vuejs.org/guide/reusability/composables.html
- https://waha.devlike.pro/docs/how-to/sessions/
