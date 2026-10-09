# WAHA Sticker Bot — Command Reference

Daftar lengkap perintah WhatsApp Sticker Studio:

Contoh memakai prefix bawaan `!`. Jika prefix chat diubah, gunakan prefix aktif;
menu, bantuan, dan contoh pada pesan kesalahan mengikuti prefix chat tersebut.
Ketik `!prefix` untuk melihat prefix atau `!prefix ?` untuk menggantinya
(di grup, perubahan hanya dapat dilakukan admin).

---

## 🎨 Sticker Media Dasar & Efek

| Perintah | Input | Deskripsi | Batasan / Opsi |
| :--- | :--- | :--- | :--- |
| `!stiker` | Reply/kirim foto/video/teks | Auto-deteksi input dan buat stiker | Maks 15MB foto, 20MB video (maks 10 detik) |
| `!stiker full` | Reply/kirim foto | Stiker penuh dengan tepi transparan kosong dipangkas | Rasio asli terjaga, sedikit padding aman di sekitar objek |
| `!stiker trim` | Reply/kirim foto | Pangkas margin latar seragam, lalu perbesar isi gambar | Cocok untuk margin putih/warna polos pada gambar atau screenshot |
| `!stiker crop` | Reply/kirim foto | Stiker kotak penuh (fit cover) | Dipotong tengah 512x512 |
| `!stiker circle` | Reply/kirim foto | Stiker bentuk lingkaran | Mask lingkaran transparan |
| `!stiker meme <atas> \| <bawah>` | Reply/kirim foto | Stiker meme dengan teks atas dan bawah | Teks otomatis di-wrap dan di-scale |
| `!stiker blur` | Reply/kirim foto | Beri efek blur lembut | Preset sigma 5 |
| `!stiker grayscale` | Reply/kirim foto | Konversi ke hitam putih monochrome | Native Sharp pipeline |
| `!stiker sepia` | Reply/kirim foto | Beri nuansa hangat vintage klasik | Color matrix transform |
| `!stiker invert` | Reply/kirim foto | Balikkan warna (negatif) | Native Sharp invert |
| `!stiker pixel` | Reply/kirim foto | Efek pixel art retro 8-bit | Safe downscale + nearest neighbor |
| `!stiker sharpen` | Reply/kirim foto | Pertajam detail gambar | Unsharp mask preset |
| `!stiker shadow` | Reply/kirim foto | Drop shadow di bawah objek | Khusus objek berlatar transparan |

---

## 🚀 Creative Studio

| Perintah | Input | Deskripsi | Contoh |
| :--- | :--- | :--- | :--- |
| `!stiker removebg` | Reply/kirim foto | Hapus background foto dengan model AI lokal U²-NetP, tanpa API key atau upload foto | `!stiker removebg` |
| `!stiker subject` | Reply/kirim foto | Smart crop otomatis fokus pada subjek utama | `!stiker subject` |
| `!stiker outline [warna]` | Reply/kirim foto | Tambahkan outline tepi stiker | `!stiker outline white`, `!stiker outline black`, `!stiker outline gold` |
| `!stiker caption [posisi] <teks>` | Reply/kirim foto | Tambahkan banner caption pada foto | `!stiker caption top Halo`, `!stiker caption bottom Keren`, `!stiker caption overlay Test` |
| `!stiker template <nama> <teks>` | Teks | Gunakan template SVG artistik | `!stiker template terminal npm test`, `!stiker template breaking Berita Heboh` |
| `!template list` | Tanpa input | Tampilkan semua template yang tersedia | `!template list` |
| `!template info <nama>` | Tanpa input | Detail spesifikasi template | `!template info breaking` |
| `!emoji <emoji>` | 1–4 emoji | Stiker ukuran besar dari emoji | `!emoji 😂`, `!emoji 🇮🇩`, `!emoji 👨‍💻` |
| `!badge <STATUS>` | Teks (maks 24 char) | Stiker status badge modern | `!badge ONLINE`, `!badge OFFLINE`, `!badge LIVE`, `!badge ERROR`, `!badge SUCCESS` |

> [!NOTE]
> **Batch Foundation**: `BatchStickerService` tersedia secara internal. Perintah WhatsApp batch belum diaktifkan (`!stiker batch` belum dibuka untuk publik hingga dukungan album WAHA stabil).

---

## 📝 Teks & Animasi

| Perintah | Input | Deskripsi | Opsi & Preset |
| :--- | :--- | :--- | :--- |
| `!stiker <teks>` | Teks langsung/reply | Stiker teks polos adaptif | Grapheme cluster safe |
| `!stiker teks <teks>` | Teks | Paksa mode teks meski mereply media | Menghindari konflik reply |
| `!stiker quote` | Reply chat | Stiker kutipan berbingkai nama pengirim | Otomatis ambil nama kontak WAHA |
| `!stiker bubble [teks]` | Reply chat/teks langsung | Bubble WhatsApp Android tema gelap, adaptif terhadap isi teks | Pesan sendiri hijau di kanan; pesan orang lain gelap di kiri; padding jam, nama/avatar grup, dan quoted reply |
| `!ttp <teks>` | Teks | Stiker teks dengan preset visual | `!ttp style gold Halo`, `!ttp style dark Halo` (preset: gradient, minimal, dark, terminal, gold, neon) |
| `!ttp --image <teks>` | Teks langsung/reply | Gambar PNG 1024×1024, dirender langsung pada resolusi penuh | `!ttp --image Tulisan besar`, `!ttp --image style gold Halo` |
| `!attp <teks>` | Teks | Stiker teks animasi multi-frame WebP | `!attp effect fade Halo`, `!attp effect zoom Halo` (preset: rainbow, fade, zoom, blink, slide, bounce) |

---

## 🔄 Konversi & Utilitas

| Perintah | Input | Deskripsi |
| :--- | :--- | :--- |
| `!toimg` | Reply stiker statis | Ekstrak stiker statis menjadi file PNG |
| `!togif` | Reply stiker animasi | Konversi stiker WebP animasi menjadi video MP4 H.264 |
| `!menu` | Bebas | Menampilkan daftar kategori perintah bot |
| `!help [topik]` | Opsional nama perintah/kategori | Panduan penggunaan detail (misal: `!help effects`, `!help removebg`) |
| `!ping` | Bebas | Cek status server dan latensi bot |
| `!prefix [simbol]` | Opsional simbol baru (grup: admin) | Lihat prefix aktif atau ubah prefix perintah (misal: `!prefix ?`) |
| `!job` | Bebas | Melihat antrean / status proses stiker aktif milik pengirim |

## Ukuran dan keterbacaan

Bubble mengikuti ukuran isi, memakai proporsi font chat, dan menempatkan jam di
kanan baris terakhir jika masih muat, dengan ruang antara teks dan jam. Jika tidak
muat, jam memakai baris terpisah. Jam memakai font lebih kecil dan posisi sedikit
lebih rendah dari teks, dengan jarak ringkas seperti bubble WhatsApp. Pesan
normal memakai ukuran font yang konsisten. Baris baru pada pesan dipertahankan.

Arah bubble dilihat dari pengguna yang meminta stiker: teks langsung atau reply
pesan sendiri berwarna hijau di kanan; reply pesan orang lain berwarna gelap di
kiri. Ekor bubble mengikuti arahnya. Nama/avatar pengirim hanya muncul pada
pesan masuk di grup; chat pribadi dan pesan sendiri tidak memiliki header itu.
Reply tanpa teks tambahan memakai waktu pesan yang direply; teks langsung
memakai waktu command. Timestamp pesan disimpan sementara dari webhook selama
24 jam, sehingga waktu reply tetap tersedia saat API WAHA tidak bisa diakses.
Jika pesan lama tidak ada di cache, bot mencoba mengambilnya melalui WAHA. Jika
tetap tidak tersedia, jam tampil `--:--`. Zona waktu default `Asia/Jakarta`; gunakan environment `TZ` untuk
menyesuaikan zona waktu perangkat WhatsApp.

Stiker tetap 512×512. Font dipilih sebesar mungkin sesuai ruang yang tersedia;
teks panjang otomatis dibungkus tanpa membuang isi teks. Bila tetap tidak muat,
bot meminta teks lebih pendek.

Stiker statis yang melewati 100 KB dikompresi otomatis sebelum dikirim, termasuk
metadata pack. Canvas dan transparansi dipertahankan. Foto dengan detail sangat
padat dapat mengalami penurunan kualitas agar sesuai batas WhatsApp.
Video juga memakai canvas 512×512 dengan padding transparan. Jika hasil animasi
melewati 500 KB, kualitas dan FPS disesuaikan otomatis tanpa memotong durasi
video, termasuk durasi pecahan detik.

`!stiker` / `!stiker full` memperbesar isi PNG transparan dengan memangkas tepi
yang sepenuhnya kosong. `removebg` dan `outline` juga memanfaatkan ruang kosong
agar subjek tidak terlalu kecil. Untuk gambar dengan margin putih atau latar
seragam, gunakan `!stiker trim`.

Foto sangat lebar atau tinggi tetap menyisakan ruang di mode `full` agar seluruh
gambar terlihat. Gunakan `!stiker crop` untuk mengisi kotak; periksa teks di tepi
karena mode ini memotong sisi gambar. Untuk teks yang ingin dibuka dalam ukuran
lebih besar, gunakan `!ttp --image` (PNG 1024×1024).
