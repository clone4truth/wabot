# WAHA Sticker Bot — Command Reference

Daftar lengkap perintah WhatsApp Sticker Studio:

---

## 🎨 Sticker Media Dasar & Efek

| Perintah | Input | Deskripsi | Batasan / Opsi |
| :--- | :--- | :--- | :--- |
| `!stiker` | Reply/kirim foto/video/teks | Auto-deteksi input dan buat stiker | Maks 15MB foto, 20MB video (maks 10 detik) |
| `!stiker full` | Reply/kirim foto | Stiker penuh tanpa crop (fit contain) | Rasio asli terjaga, background transparan |
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
| `!stiker removebg` | Reply/kirim foto | Hapus background foto menjadi transparan | `!stiker removebg` |
| `!stiker subject` | Reply/kirim foto | Smart crop otomatis fokus pada subjek utama | `!stiker subject` |
| `!stiker outline [warna]` | Reply/kirim foto | Tambahkan outline tepi stiker | `!stiker outline white`, `!stiker outline black` |
| `!stiker caption [posisi] <teks>` | Reply/kirim foto | Tambahkan banner caption pada foto | `!stiker caption top Halo`, `!stiker caption bottom Keren`, `!stiker caption overlay Test` |
| `!stiker template <nama> <teks>` | Teks atau reply foto | Gunakan template SVG artistik | `!stiker template terminal npm test`, `!stiker template breaking Berita Heboh` |
| `!template list` | Tanpa input | Tampilkan semua template yang tersedia | `!template list` |
| `!template info <nama>` | Tanpa input | Detail spesifikasi template | `!template info breaking` |
| `!emoji <emoji>` | 1–4 emoji | Stiker ukuran besar dari emoji | `!emoji 😂`, `!emoji 🇮🇩`, `!emoji 👨‍💻` |
| `!badge <STATUS>` | Teks (maks 24 char) | Stiker status badge modern | `!badge ONLINE`, `!badge OFFLINE`, `!badge LIVE`, `!badge ERROR`, `!badge SUCCESS` |

---

## 📝 Teks & Animasi

| Perintah | Input | Deskripsi | Opsi & Preset |
| :--- | :--- | :--- | :--- |
| `!stiker <teks>` | Teks langsung/reply | Stiker teks polos adaptif | Grapheme cluster safe |
| `!stiker teks <teks>` | Teks | Paksa mode teks meski mereply media | Menghindari konflik reply |
| `!stiker quote` | Reply chat | Stiker kutipan berbingkai nama pengirim | Otomatis ambil nama kontak WAHA |
| `!stiker bubble` | Reply chat | Stiker chat bubble WhatsApp | Mendukung avatar & quoted reply |
| `!ttp <teks>` | Teks | Stiker teks dengan preset visual | `!ttp style gold Halo`, `!ttp style dark Halo` (preset: gradient, minimal, dark, terminal, gold, neon) |
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
| `!prefix <simbol>` | Simbol baru (grup: admin) | Mengubah prefix perintah (misal: `!prefix ?`) |
| `!job` | Bebas | Melihat antrean / status proses stiker aktif milik pengirim |
