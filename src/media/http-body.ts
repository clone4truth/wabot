/**
 * Pembuang body response HTTP yang tidak dibaca.
 *
 * INVEKTOR: node-fetch dan undici tidak memiliki finalizer GC untuk response.
 * Body yang tidak pernah dibaca membuat socket TIDAK pernah dikembalikan ke
 * agent keep-alive. Pada node-fetch, body dipipe ke PassThrough 16 KB; begitu
 * highWaterMark penuh, socket kena back-pressure selamanya. File descriptor
 * lalu bocor permanen — dan karena WAHA berjalan di VPS yang sama, bot memakan
 * FD milik dependency-nya sendiri (EMFILE → server overload).
 *
 * Aturan: SETIAP response yang body-nya tidak dibaca sampai habis harus
 * dilewatkan ke `discardResponseBody` sebelum di-throw atau di-return.
 */

type DestroyableBody = {
  destroy?: () => unknown;
  cancel?: () => unknown;
  resume?: () => unknown;
};

export function discardResponseBody(res: unknown): void {
  const body = (res as { body?: DestroyableBody | null } | null | undefined)?.body;
  if (!body) return;

  try {
    // Node stream (node-fetch v3 memakai PassThrough).
    if (typeof body.destroy === 'function') {
      body.destroy();
      return;
    }
    // Web ReadableStream (undici / globalThis.fetch).
    if (typeof body.cancel === 'function') {
      const result = body.cancel() as unknown;
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(() => {});
      }
      return;
    }
    // Fallback terakhir: kuras stream supaya socket dilepas.
    if (typeof body.resume === 'function') body.resume();
  } catch {
    // Body sudah tertutup / tidak ada — abaikan.
  }
}

/**
 * Bungkus `discardResponseBody` di `finally` untuk jalur yang TIDAK
 * membaca body sampai habis.
 */
export async function withBodyDiscard<T>(res: unknown, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } finally {
    discardResponseBody(res);
  }
}