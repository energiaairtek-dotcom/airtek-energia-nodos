import { defineConfig } from 'vitest/config';
import path from 'path';

// Configuración aislada de Vitest para no alterar la de Vite (build/dev).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    reporters: 'default',
  },
});
