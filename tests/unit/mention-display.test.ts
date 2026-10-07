import { describe, expect, it, vi } from 'vitest';
import { resolveMentionDisplayNames } from '../../src/whatsapp/mention-display';

describe('WhatsApp mention display names', () => {
  it('mengganti semua @nomor dengan nama kontak dan hanya lookup sekali per nomor', async () => {
    const lookup = {
      getContactSavedName: vi.fn(async (id: string) => id === '628123456789' ? 'Budi Santoso' : 'Ani'),
    };

    const result = await resolveMentionDisplayNames([
      '@628123456789 kocaklu @628987654321',
      'balas @628123456789',
    ], lookup);

    expect(result).toEqual([
      '@Budi Santoso kocaklu @Ani',
      'balas @Budi Santoso',
    ]);
    expect(lookup.getContactSavedName).toHaveBeenCalledTimes(2);
  });

  it('tidak pernah membocorkan nomor saat nama kontak tidak tersedia', async () => {
    const result = await resolveMentionDisplayNames(
      ['halo @68509711216870'],
      { getContactSavedName: async () => undefined },
    );
    expect(result[0]).toBe('halo @Pengguna WhatsApp');
    expect(result[0]).not.toContain('68509711216870');
  });

  it('menerima bentuk JID @lid dan mengirim contactId lengkap ke WAHA', async () => {
    const lookup = { getContactSavedName: vi.fn(async () => 'Kontak LID') };
    const result = await resolveMentionDisplayNames(['halo @6850971121687012@lid'], lookup);
    expect(result[0]).toBe('halo @Kontak LID');
    expect(lookup.getContactSavedName).toHaveBeenCalledWith('6850971121687012@lid');
  });

  it('tidak menganggap bagian email sebagai mention WhatsApp', async () => {
    const lookup = { getContactSavedName: vi.fn(async () => 'Nama') };
    const result = await resolveMentionDisplayNames(['admin@123456789.example'], lookup);
    expect(result[0]).toBe('admin@123456789.example');
    expect(lookup.getContactSavedName).not.toHaveBeenCalled();
  });
});
