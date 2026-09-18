import { COMMAND_REGISTRY, findCommand, getCommandsByCategory } from './metadata';

export function handleHelp(topic?: string): string {
  const cleanTopic = topic?.trim().toLowerCase().replace(/^!/, '');

  if (cleanTopic) {
    // Check if it's a category
    const categoryMatches = getCommandsByCategory(cleanTopic);
    if (categoryMatches.length > 0) {
      const lines = [`📖 *Panduan Kategori: ${cleanTopic.toUpperCase()}*\n`];
      for (const cmd of categoryMatches) {
        lines.push(`• *${cmd.usage}*\n  ${cmd.description}\n`);
      }
      return lines.join('\n');
    }

    // Check if it's a specific command
    const cmd = findCommand(cleanTopic);
    if (cmd) {
      return [
        `📖 *Bantuan Command: ${cmd.name}*`,
        '',
        `*Penggunaan:* \`${cmd.usage}\``,
        `*Kategori:* ${cmd.category}`,
        `*Penjelasan:* ${cmd.description}`,
      ].join('\n');
    }
  }

  return [
    '📖 *PANDUAN STIKER BOT*',
    '',
    '• *Stiker & Efek Media*:',
    '  Reply/kirim foto lalu:',
    '  - `!stiker full` (penuh) / `!stiker crop` (kotak) / `!stiker circle` (lingkaran)',
    '  - Efek: `!stiker blur`, `!stiker grayscale`, `!stiker sepia`, `!stiker invert`, `!stiker pixel`, `!stiker sharpen`',
    '',
    '• *Creative Studio*:',
    '  - `!stiker removebg` → Hapus latar belakang foto',
    '  - `!stiker subject` → Potong otomatis fokus ke subjek utama',
    '  - `!stiker outline [white|black]` → Tambahkan garis tepi stiker',
    '  - `!stiker caption [top|bottom|overlay] <teks>` → Tambahkan caption pada foto',
    '  - `!stiker template <nama> <teks>` → Stiker bergaya template',
    '  - `!emoji <emoji>` → Buat stiker besar dari 1-4 emoji',
    '  - `!badge <STATUS>` → Stiker badge status keren',
    '',
    '• *Teks & Animasi*:',
    '  - `!ttp <teks>` atau `!ttp style <preset> <teks>` (preset: gradient, gold, dark, terminal, neon, minimal)',
    '  - `!attp <teks>` atau `!attp effect <preset> <teks>` (preset: rainbow, fade, zoom, blink, slide, bounce)',
    '  - `!stiker quote` (kutipan nama) / `!stiker bubble` (chat WhatsApp)',
    '',
    '• *Konversi*:',
    '  - `!toimg` (reply stiker statis)',
    '  - `!togif` (reply stiker animasi)',
    '',
    '💡 Ketik `!help <topik>` (misal: `!help removebg` atau `!help effects`) untuk bantuan spesifik.',
  ].join('\n');
}
