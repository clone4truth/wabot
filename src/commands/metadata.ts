export interface CommandMetadata {
  name: string;
  description: string;
  usage: string;
  category: 'Sticker' | 'Effects' | 'Text' | 'Animation' | 'Creative' | 'Utility';
  aliases?: string[];
}

export const COMMAND_REGISTRY: CommandMetadata[] = [
  // Sticker
  { name: 'stiker', description: 'Buat stiker dari foto, video, atau teks', usage: '!stiker', category: 'Sticker' },
  { name: 'stiker full', description: 'Stiker foto penuh tanpa crop (contain)', usage: '!stiker full', category: 'Sticker' },
  { name: 'stiker crop', description: 'Stiker foto kotak terpotong (cover)', usage: '!stiker crop', category: 'Sticker' },
  { name: 'stiker circle', description: 'Stiker foto bentuk lingkaran', usage: '!stiker circle', category: 'Sticker' },
  { name: 'stiker meme', description: 'Stiker foto meme teks atas dan bawah', usage: '!stiker meme <atas> | <bawah>', category: 'Sticker' },
  { name: 'toimg', description: 'Konversi stiker statis ke gambar PNG', usage: '!toimg (reply stiker)', category: 'Sticker' },
  { name: 'togif', description: 'Konversi stiker animasi ke video MP4', usage: '!togif (reply stiker animasi)', category: 'Sticker' },

  // Effects
  { name: 'stiker blur', description: 'Efek blur halus pada gambar', usage: '!stiker blur', category: 'Effects' },
  { name: 'stiker grayscale', description: 'Efek hitam putih (monochrome)', usage: '!stiker grayscale', category: 'Effects' },
  { name: 'stiker sepia', description: 'Efek warna hangat vintage klasik', usage: '!stiker sepia', category: 'Effects' },
  { name: 'stiker invert', description: 'Balikkan warna foto (negatif)', usage: '!stiker invert', category: 'Effects' },
  { name: 'stiker pixel', description: 'Efek pixel art retro', usage: '!stiker pixel', category: 'Effects' },
  { name: 'stiker sharpen', description: 'Pertajam detail foto', usage: '!stiker sharpen', category: 'Effects' },
  { name: 'stiker shadow', description: 'Beri bayangan drop shadow', usage: '!stiker shadow', category: 'Effects' },

  // Text
  { name: 'stiker teks', description: 'Paksa pembuatan stiker teks', usage: '!stiker teks <teks>', category: 'Text' },
  { name: 'stiker quote', description: 'Stiker kutipan berbingkai nama pengirim', usage: '!stiker quote <teks>', category: 'Text' },
  { name: 'stiker bubble', description: 'Stiker chat bubble mirip WhatsApp', usage: '!stiker bubble <teks>', category: 'Text' },
  { name: 'ttp', description: 'Teks ke gambar dengan gaya preset (gradient/dark/gold/terminal/neon/minimal)', usage: '!ttp <teks> atau !ttp style <preset> <teks>', category: 'Text' },

  // Animation
  { name: 'attp', description: 'Teks animasi dengan efek (rainbow/fade/zoom/blink/slide/bounce)', usage: '!attp <teks> atau !attp effect <preset> <teks>', category: 'Animation' },

  // Creative
  { name: 'stiker removebg', description: 'Hapus background foto menjadi transparan', usage: '!stiker removebg (reply foto)', category: 'Creative' },
  { name: 'stiker subject', description: 'Smart crop otomatis fokus ke objek utama', usage: '!stiker subject (reply foto)', category: 'Creative' },
  { name: 'stiker outline', description: 'Tambahkan outline putih/hitam di sekitar objek', usage: '!stiker outline [white|black]', category: 'Creative' },
  { name: 'stiker caption', description: 'Tambahkan caption atas, bawah, atau overlay di foto', usage: '!stiker caption [top|bottom|overlay] <teks>', category: 'Creative' },
  { name: 'stiker template', description: 'Gunakan template stiker (terminal, breaking, wanted, minimal)', usage: '!stiker template <nama> <teks>', category: 'Creative' },
  { name: 'template', description: 'Lihat daftar template atau info detail', usage: '!template list atau !template info <nama>', category: 'Creative' },
  { name: 'emoji', description: 'Buat stiker dari 1-4 emoji', usage: '!emoji <emoji>', category: 'Creative' },
  { name: 'badge', description: 'Stiker status badge (ONLINE/OFFLINE/LIVE/ERROR/SUCCESS)', usage: '!badge <STATUS>', category: 'Creative' },

  // Utility
  { name: 'menu', description: 'Tampilkan menu utama', usage: '!menu', category: 'Utility' },
  { name: 'help', description: 'Bantuan penggunaan atau detail topik', usage: '!help [kategori/command]', category: 'Utility' },
  { name: 'ping', description: 'Cek latensi dan status bot', usage: '!ping', category: 'Utility' },
  { name: 'prefix', description: 'Lihat atau ubah prefix bot', usage: '!prefix <simbol>', category: 'Utility' },
  { name: 'job', description: 'Cek status proses stiker aktif', usage: '!job', category: 'Utility' },
];

export function findCommand(query: string): CommandMetadata | undefined {
  const clean = query.trim().toLowerCase().replace(/^!/, '');
  return COMMAND_REGISTRY.find(
    (c) => c.name.toLowerCase() === clean || c.name.toLowerCase().startsWith(clean + ' ')
  );
}

export function getCommandsByCategory(category: string): CommandMetadata[] {
  return COMMAND_REGISTRY.filter((c) => c.category.toLowerCase() === category.toLowerCase());
}
