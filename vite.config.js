import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Vite n'expose que les variables VITE_* par défaut. On ajoute le préfixe
  // REACT_APP_ pour le flag REACT_APP_CLUB_FEATURES (voir src/lib/features.js).
  envPrefix: ['VITE_', 'REACT_APP_'],
  plugins: [
    {
      name: 'treat-js-as-jsx',
      async transform(code, id) {
        if (!/src\/.*\.js$/.test(id)) return null;
        return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
      },
    },
    react(),
  ],
  build: {
    outDir: 'build',
  },
});
