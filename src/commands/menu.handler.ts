import env from '../config/env';
import { COMMAND_REGISTRY, formatCommandExamples } from './metadata';

export function handleMenu(prefix: string = env.commandPrefix): string {
  const categories = [
    { key: 'Sticker', label: '🎨 *Sticker*' },
    { key: 'Effects', label: '✨ *Effects*' },
    { key: 'Text', label: '📝 *Text*' },
    { key: 'Animation', label: '🎬 *Animation*' },
    { key: 'Creative', label: '🚀 *Creative Studio*' },
    { key: 'Utility', label: '⚙️ *Utility*' },
  ];

  const lines: string[] = [
    '✨ *WHATSAPP STICKER STUDIO* ✨',
    '',
  ];

  for (const cat of categories) {
    lines.push(cat.label);
    const items = COMMAND_REGISTRY.filter((c) => c.category === cat.key);
    for (const item of items) {
      lines.push(`  • \`${item.usage}\` — ${item.description}`);
    }
    lines.push('');
  }

  lines.push('💡 _Ketik `!help <topik>` untuk panduan detail (contoh: `!help effects`, `!help removebg`)_');
  return formatCommandExamples(lines.join('\n'), prefix);
}
