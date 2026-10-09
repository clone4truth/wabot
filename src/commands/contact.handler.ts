import { NormalizedMessage } from '../whatsapp/types';
import { ContactAliasStore, contactAliases, MAX_CONTACT_ALIAS_LENGTH, MAX_CONTACT_ALIASES_PER_USER } from '../whatsapp/contact-aliases';
import { formatCommandExamples } from './metadata';

export function handleContactCommand(
  args: string,
  message: NormalizedMessage,
  prefix: string,
  aliases: ContactAliasStore = contactAliases,
): string {
  const usage = formatCommandExamples([
    '👤 *Nama kontak pribadi*',
    'Reply pesan orang yang ingin kamu beri nama, lalu gunakan:',
    '• `!kontak nama Kak Rara` — simpan atau ganti nama',
    '• `!kontak` — lihat nama pilihanmu',
    '• `!kontak hapus` — hapus nama pilihanmu',
    'Nama ini berlaku untuk bubble dan quote yang kamu buat. Setiap pengguna memiliki nama pilihannya sendiri.',
  ].join('\n'), prefix);
  const match = args.trim().match(/^(\S+)(?:\s+([\s\S]*))?$/u);
  const action = match?.[1].toLowerCase() ?? 'lihat';
  const name = match?.[2] ?? '';
  if (action === 'help') return usage;
  if (!['nama', 'lihat', 'hapus'].includes(action) || (action !== 'nama' && name)) {
    return `❌ Perintah kontak tidak dikenal.\n${usage}`;
  }
  const contactId = message.reply?.senderId;
  if (!contactId) return `❌ Reply pesan seseorang agar nama kontaknya bisa dikenali.\n${usage}`;

  if (action === 'nama') {
    const saved = aliases.set(message.senderId, contactId, name, message.session);
    if (!saved.ok) {
      if (saved.reason === 'limit') return `❌ Maksimal ${MAX_CONTACT_ALIASES_PER_USER} nama kontak pribadi. Hapus salah satu sebelum menambah nama baru.`;
      return `❌ Nama kontak wajib diisi, maksimal ${MAX_CONTACT_ALIAS_LENGTH} karakter.\n${usage}`;
    }
    return `✅ Nama kontak pilihanmu disimpan: ${saved.name}\nNama ini digunakan pada bubble dan quote yang kamu buat.`;
  }
  if (action === 'hapus') {
    return aliases.delete(message.senderId, contactId, message.session)
      ? '✅ Nama kontak pilihanmu dihapus. Bubble dan quote kembali memakai nama dari WhatsApp bot.'
      : 'Belum ada nama kontak pilihanmu untuk pengirim pesan ini.';
  }
  const saved = aliases.get(message.senderId, contactId, message.session);
  return saved
    ? `Nama kontak pilihanmu: ${saved}`
    : formatCommandExamples('Belum ada nama kontak pilihanmu. Reply pesan ini lalu gunakan `!kontak nama <nama>`.', prefix);
}
