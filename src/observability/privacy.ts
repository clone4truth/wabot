import crypto from 'crypto';

// Hash satu arah untuk identifier di log (chatId, senderId, messageId, ...).
// Deterministik untuk korelasi, tidak bisa dikembalikan ke value asli.
export function hashIdentifier(value: string | undefined | null): string {
  if (!value) return 'n/a';
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}
