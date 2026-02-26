import path from 'node:path';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@common': path.resolve(import.meta.dirname, 'modules/common/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.spec.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
