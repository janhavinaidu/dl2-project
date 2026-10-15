import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const rootDir = import.meta.dirname;
const webDir = path.resolve(rootDir, 'web');
const shimsDir = path.resolve(webDir, 'shims');

export default defineConfig({
  root: webDir,
  publicDir: false,
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-native-web'],
    alias: [
      {
        find: /^react-native$/,
        replacement: path.resolve(shimsDir, 'react-native.ts'),
      },
      {
        find: /^react-native-image-picker$/,
        replacement: path.resolve(shimsDir, 'image-picker.ts'),
      },
      {
        find: /^react-native-safe-area-context$/,
        replacement: path.resolve(shimsDir, 'safe-area-context.tsx'),
      },
      {
        find: /^@react-native-community\/geolocation$/,
        replacement: path.resolve(shimsDir, 'geolocation.ts'),
      },
    ],
    extensions: [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
      '.json',
    ],
  },
  define: {
    global: 'globalThis',
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: path.resolve(rootDir, 'web-dist'),
    emptyOutDir: true,
  },
});
