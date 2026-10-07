import { describe, expect, it } from 'vitest';
import {
  firstHumanDisplayName,
  isIdentifierLikeName,
} from '../../src/whatsapp/display-name';

describe('WhatsApp display name', () => {
  it('memilih nama manusia pertama yang tersedia', () => {
    expect(firstHumanDisplayName(['', '628123@lid', 'Budi Santoso'], 'Pengguna WhatsApp'))
      .toBe('Budi Santoso');
  });

  it('menolak ID WhatsApp dan nomor telepon sebagai nama', () => {
    const identifiers = ['628123@lid', '628123@c.us', '120363@g.us', '62812345', '+62 812-3456'];
    for (const value of identifiers) {
      expect(isIdentifierLikeName(value)).toBe(true);
    }
  });

  it('menggunakan label netral bila nama asli tidak tersedia', () => {
    expect(firstHumanDisplayName(['628123@lid', '+62 812-3456'], 'Pengguna WhatsApp'))
      .toBe('Pengguna WhatsApp');
  });
});
