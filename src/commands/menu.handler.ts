export function handleMenu(): string {
  return [
    '📋 *DAFTAR COMMAND*:',
    '',
    '!stiker <teks> — Buat stiker teks',
    '!stiker teks <teks> — Paksa mode teks',
    '!stiker quote — Stiker quote (reply teks)',
    '!stiker bubble — Stiker bubble (reply teks)',
    '!stiker full — Stiker foto full (reply/kirim foto)',
    '!stiker crop — Stiker foto crop (reply/kirim foto)',
    '!stiker circle — Stiker foto bulat (reply/kirim foto)',
    '!stiker meme <atas> | <bawah> — Stiker meme (reply/kirim foto)',
    '!ttp <teks> — Stiker teks warna-warni',
    '!attp <teks> — Stiker teks animasi',
    '!stiker — Otomatis deteksi input media/teks',
    '!toimg — Konversi stiker statis ke gambar',
    '!togif — Konversi stiker animasi ke video',
    '!prefix — Lihat/ubah prefix chat',
    '!help — Bantuan penggunaan',
    '!menu — Tampilkan daftar ini',
    '!ping — Cek status bot',
  ].join('\n');
}
