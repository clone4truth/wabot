/** WEBJS can expose a quoted Wid object instead of its serialized string. */
export function readWahaIdentifier(value: unknown): string | undefined {
  const id = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && '_serialized' in value
      ? value._serialized
      : undefined;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

/** WAHA message ids are {fromMe}_{chatId}_{stanzaId}[_{participant}]. */
export function messageStanzaId(messageId: string): string {
  const parts = messageId.split('_');
  if ((parts.length === 3 || parts.length === 4) &&
      (parts[0] === 'true' || parts[0] === 'false') && parts[1].includes('@') && parts[2]) {
    return parts[2];
  }
  return messageId;
}
