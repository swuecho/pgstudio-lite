import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" paths mapping in tsconfig.json.
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.git/**', '**/.test-dist/**'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      // `npm run test:coverage`. Summary in the terminal, per-file drill-down in
      // coverage/index.html. No thresholds yet: this is for visibility.
      provider: 'v8',
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['components/**', 'electron/**', 'features/**', 'hooks/**', 'lib/**', 'pages/**'],
      exclude: ['**/*.d.ts', '**/*.module.css', 'pages/_app.tsx', 'pages/_document.tsx'],
    },
  },
})
