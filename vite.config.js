import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      include: /\.(jsx?|tsx?)$/,
    }),
  ],
  build: {
    outDir: 'build',
    rolldownOptions: {
      // Traiter les .js comme du JSX (le projet utilise .js pour tout)
      moduleTypes: {
        '.js': 'jsx',
      },
    },
  },
  optimizeDeps: {
    rolldownOptions: {
      moduleTypes: {
        '.js': 'jsx',
      },
    },
  },
});
