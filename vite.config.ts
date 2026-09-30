import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const activeKey = env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || 'AIzaSyDt-C-67bDsRiG9ktNAswhKLvmfgFeyS00';

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(activeKey),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(activeKey),
      'import.meta.env.GEMINI_API_KEY': JSON.stringify(activeKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: {
        overlay: true
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});