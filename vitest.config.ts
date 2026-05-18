import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.git/**', '**/.test-dist/**'],
    setupFiles: ['tests/setup.ts'],
  },
})
