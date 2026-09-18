import { ParsedCommand } from './parser';
import { defaultTemplateRegistry } from '../stickers/templates/registry';

export function handleTemplateCommand(command: ParsedCommand): string {
  const parts = command.args.trim().split(/\s+/).filter(Boolean);
  const action = parts[0]?.toLowerCase();

  if (action === 'info' && parts[1]) {
    const name = parts[1].toLowerCase();
    const tpl = defaultTemplateRegistry.get(name);
    if (!tpl) {
      return `❌ Template "${name}" tidak ditemukan.\nGunakan !template list untuk melihat daftar.`;
    }
    return `📋 *Template Info: ${tpl.name}*\n` +
      `Deskripsi: ${tpl.description}\n` +
      `Input: ${tpl.supportedInput}\n\n` +
      `Contoh penggunaan:\n` +
      `!stiker template ${tpl.name} Teks contoh`;
  }

  const list = defaultTemplateRegistry.list();
  let text = '🎨 *Daftar Template Sticker*\n\n';
  for (const t of list) {
    text += `• *${t.name}* (${t.supportedInput}): ${t.description}\n`;
  }
  text += '\n💡 Cara pakai: `!stiker template <nama> <teks>`';
  text += '\nℹ️ Info detail: `!template info <nama>`';
  return text;
}
