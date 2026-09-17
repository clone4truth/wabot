export function handleMenu(): string {
  return [
    '📋 *DAFTAR COMMAND*:',
    '',
    '!stiker <teks> — Buat stiker teks',
    '!stiker full — Stiker image (full)',
    '!stiker crop — Stiker image (crop)',
    '!stiker circle — Stiker image (circle)',
    '!stiker quote — Stiker quote',
    '!stiker bubble — Stiker bubble',
    '!stiker meme <atas> | <bawah> — Stiker meme',
    '!stiker teks <teks> — Paksa mode teks',
    '!stiker — Otomatis detect input',
    '!toimg — Konversi sticker static ke gambar',
    '!togif — Konversi animated sticker ke media',
    '!menu — Tampilkan daftar ini',
    '!help — Bantuan penggunaan',
    '!ping — Cek status bot',
  ].join('\n');
}
