import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.spec.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
