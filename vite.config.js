import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: false,
    watch: {
      ignored: ['**/scratch/**', '**/*.tmp*', '**/.git/**'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Solo se separan las dependencias grandes de terceros. Los módulos de la
        // app NO se fuerzan a chunks propios: al agruparlos, Rollup arrastraba
        // código compartido (iconos, servicios) a los chunks diferidos y el entry
        // terminaba importándolos, anulando la carga bajo demanda.
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-firebase': ['firebase/compat/app', 'firebase/compat/auth', 'firebase/compat/firestore'],
        },
      },
    },
  },
});
