import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    globals: true,
    environment: 'node',
    // Isolasi TEMP_DIR/DATA_DIR per file test: cegah race antar worker paralel
    // yang membaca/menulis /tmp/waha-sticker-bot yang sama (flaky CI).
    globalSetup: ['./tests/setup-temp-dir.ts'],
    setupFiles: ['./tests/setup-test-dirs.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
    },
  },
});
