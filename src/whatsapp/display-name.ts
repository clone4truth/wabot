const WHATSAPP_ID = /@(?:c\.us|lid|g\.us)$/i;
const PHONE_LIKE = /^\+?[\d\s().-]{5,}$/;

/** True bila nilai terlihat seperti identifier WhatsApp/nomor, bukan nama orang. */
export function isIdentifierLikeName(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const name = value.trim();
  if (!name) return false;
  return WHATSAPP_ID.test(name) || PHONE_LIKE.test(name);
}

/** Ambil nama manusia pertama; ID mentah tidak pernah lolos ke hasil render. */
export function firstHumanDisplayName(
  candidates: readonly unknown[],
  fallback?: string,
): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const name = candidate.trim();
    if (!name || name === '~' || isIdentifierLikeName(name)) continue;
    return name.slice(0, 32);
  }
  return fallback;
}
