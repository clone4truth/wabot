import env from '../config/env';
import { findCommand, formatCommandExamples, getCommandsByCategory } from './metadata';

export function handleHelp(topic?: string, prefix: string = env.commandPrefix): string {
  const trimmedTopic = topic?.trim().toLowerCase();
  const cleanTopic = (trimmedTopic?.startsWith(prefix)
    ? trimmedTopic.slice(prefix.length)
    : trimmedTopic?.replace(/^!/, ''))?.trim().replace(/\s+/g, ' ');

  if (cleanTopic) {
    // Check if it's a category
    const categoryMatches = getCommandsByCategory(cleanTopic);
    if (categoryMatches.length > 0) {
      const lines = [`📖 *Panduan Kategori: ${cleanTopic.toUpperCase()}*\n`];
      for (const cmd of categoryMatches) {
        lines.push(`• *${cmd.usage}*\n  ${cmd.description}\n`);
      }
      return formatCommandExamples(lines.join('\n'), prefix);
    }

    // Check if it's a specific command
    const cmd = findCommand(cleanTopic);
    if (cmd) {
      return formatCommandExamples([
        `📖 *Bantuan Command: ${cmd.name}*`,
        '',
        `*Penggunaan:* \`${cmd.usage}\``,
        `*Kategori:* ${cmd.category}`,
        `*Penjelasan:* ${cmd.description}`,
      ].join('\n'), prefix);
    }

    return formatCommandExamples(`❌ Topik "${cleanTopic}" tidak ditemukan.\nKetik !menu untuk daftar perintah atau !help untuk panduan.`, prefix);
  }

  return formatCommandExamples([
    '📖 *PANDUAN STIKER BOT*',
    '',
    '• *Stiker & Efek Media*:',
    '  Reply/kirim foto lalu:',
    '  - `!stiker full` (penuh) / `!stiker crop` (kotak) / `!stiker circle` (lingkaran)',
    '  - `!stiker trim` → Pangkas margin putih/latar seragam agar isi gambar lebih besar',
    '  - Foto memanjang: `full` menjaga seluruh gambar; `crop` mengisi kotak dengan memotong sisi gambar',
    '  - Efek: `!stiker blur`, `!stiker grayscale`, `!stiker sepia`, `!stiker invert`, `!stiker pixel`, `!stiker sharpen`',
    '',
    '• *Creative Studio*:',
    '  - `!stiker removebg` → Hapus latar belakang foto',
    '  - `!stiker subject` → Potong otomatis fokus ke subjek utama',
    '  - `!stiker outline [white|black|gold]` → Tambahkan garis tepi stiker',
    '  - `!stiker caption [top|bottom|overlay] <teks>` → Tambahkan caption pada foto',
    '  - `!stiker template <nama> <teks>` → Stiker bergaya template',
    '  - `!emoji <emoji>` → Buat stiker besar dari 1-4 emoji',
    '  - `!badge <STATUS>` → Stiker badge status keren',
    '',
    '• *Teks & Animasi*:',
    '  - `!ttp <teks>` atau `!ttp style <preset> <teks>` (preset: gradient, gold, dark, terminal, neon, minimal)',
    '  - `!ttp --image [style <preset>] <teks>` → Gambar PNG 1024×1024 untuk dibuka lebih besar',
    '  - `!attp <teks>` atau `!attp effect <preset> <teks>` (preset: rainbow, fade, zoom, blink, slide, bounce)',
    '  - Reply chat lalu `!stiker quote` (kutipan nama) / `!stiker bubble` (nama dan waktu pesan asli)',
    '  - Teks langsung: `!stiker bubble Halo` atau `!stiker quote Halo`',
    '',
    '• *Konversi*:',
    '  - `!toimg` (reply stiker statis)',
    '  - `!togif` (reply stiker animasi)',
    '',
    '💡 Ketik `!help <topik>` (misal: `!help removebg` atau `!help effects`) untuk bantuan spesifik.',
  ].join('\n'), prefix);
}
