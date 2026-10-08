import { ParsedCommand } from './parser';
import { defaultTemplateRegistry } from '../stickers/templates/registry';
import env from '../config/env';
import { formatCommandExamples } from './metadata';

export function handleTemplateCommand(command: ParsedCommand, prefix: string = env.commandPrefix): string {
  const parts = command.args.trim().split(/\s+/).filter(Boolean);
  const action = parts[0]?.toLowerCase();

  if (action === 'info' && parts[1]) {
    const name = parts[1].toLowerCase();
    const tpl = defaultTemplateRegistry.get(name);
    if (!tpl) {
      return formatCommandExamples(`❌ Template "${name}" tidak ditemukan.\nGunakan !template list untuk melihat daftar.`, prefix);
    }
    return formatCommandExamples(`📋 *Template Info: ${tpl.name}*\n` +
      `Deskripsi: ${tpl.description}\n` +
      `Input: ${tpl.supportedInput}\n\n` +
      `Contoh penggunaan:\n` +
      `!stiker template ${tpl.name} Teks contoh`, prefix);
  }

  if (action === 'info') {
    return formatCommandExamples('❌ Tentukan nama template. Contoh: !template info terminal.\nGunakan !template list untuk melihat daftar.', prefix);
  }
  if (action && action !== 'list') {
    return formatCommandExamples(`❌ Perintah template "${action}" tidak dikenal.\nGunakan !template list atau !template info <nama>.`, prefix);
  }

  const list = defaultTemplateRegistry.list();
  let text = '🎨 *Daftar Template Sticker*\n\n';
  for (const t of list) {
    text += `• *${t.name}* (${t.supportedInput}): ${t.description}\n`;
  }
  text += '\n💡 Cara pakai: `!stiker template <nama> <teks>`';
  text += '\nℹ️ Info detail: `!template info <nama>`';
  return formatCommandExamples(text, prefix);
}
