import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    {
      name: 'treat-js-as-jsx',
      async transform(code, id) {
        if (!/src\/.*\.js$/.test(id)) return null;
        return transformWithEsbuild(code, id, { loader: 'jsx' });
      },
    },
    react(),
  ],
  build: {
    outDir: 'build',
  },
});
