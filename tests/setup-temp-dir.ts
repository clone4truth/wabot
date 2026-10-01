/**
 * Vitest globalSetup — dijalankan SEKALI di proses utama sebelum worker fork,
 * sehingga env ini diwarisi SEMUA worker test.
 *
 * MASALAH YANG DIATASI: env.tempDir default = '/tmp/waha-sticker-bot' dipakai
 * bersama oleh semua file test yang berjalan PARALEL di worker vitest berbeda.
 * Test yang memverifikasi "tidak ada file temp bocor" (video-convert, attp)
 * bisa salah menghitung file milik worker lain sebagai kebocoran — kegagalan
 * flaky yang muncul di CI (lihat !togif timeout -> workspace bersih).
 *
 * Solusi: buat root sementara per run, lalu setup-test-dirs.ts membuat
 * TEMP_DIR + DATA_DIR unik per file test. Semua dihapus setelah run selesai.
 * Tidak ada test yang bergantung pada lokasi
 * fisik tempDir — semuanya membaca env.tempDir secara dinamis.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

export default function setup(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-test-tmp-'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-test-data-'));

  process.env.WABOT_TEST_TEMP_ROOT = tempDir;
  process.env.WABOT_TEST_DATA_ROOT = dataDir;

  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
}
