import { firstHumanDisplayName } from './display-name';

const PHONE_MENTION = /(^|[^\w@])@(\d{7,20})(@(?:c\.us|lid))?(?![\d\w])/gi;

export interface ContactNameLookup {
  getContactSavedName(contactId: string): Promise<string | undefined>;
}

/**
 * Resolve literal WhatsApp mentions in one batch so every unique number causes
 * at most one WAHA contacts request. Raw numbers are accepted by WAHA's
 * documented GET /api/contacts endpoint.
 */
export async function resolveMentionDisplayNames(
  texts: readonly (string | undefined)[],
  lookup: ContactNameLookup,
): Promise<string[]> {
  const numbers = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(PHONE_MENTION)) numbers.add(`${match[2]}${match[3] ?? ''}`);
  }

  const names = new Map<string, string>();
  await Promise.all([...numbers].map(async (number) => {
    const resolved = await lookup.getContactSavedName(number).catch(() => undefined);
    names.set(number, firstHumanDisplayName([resolved], 'Pengguna WhatsApp')!);
  }));

  return texts.map((text) => String(text ?? '').replace(
    PHONE_MENTION,
    (_whole, prefix: string, number: string, suffix?: string) => {
      const contactId = `${number}${suffix ?? ''}`;
      return `${prefix}@${names.get(contactId) ?? 'Pengguna WhatsApp'}`;
    },
  ));
}
