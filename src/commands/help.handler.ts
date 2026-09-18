export function handleHelp(): string {
  return [
    '📖 *BANTUAN*:',
    '',
    'Kirim !stiker diikuti teks, reply foto/video, atau kirim foto/video dengan caption !stiker.',
    'Reply pesan lalu !stiker untuk mengubahnya jadi stiker.',
    '',
    '*Contoh:*',
    '!stiker Hello World',
    'Reply foto lalu !stiker crop',
    'Reply teks lalu !stiker quote',
    '!stiker meme TEKAN | DISINI',
    '!ttp Halo Dunia',
    '',
    '!toimg → Ubah sticker static jadi gambar',
    '!togif → Ubah animated sticker jadi video',
    '!menu → Lihat semua command',
    '!ping → Cek bot hidup',
  ].join('\n');
}
