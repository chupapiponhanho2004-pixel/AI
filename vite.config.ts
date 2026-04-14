import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    // SỬA TẠI ĐÂY: Chỉ để một dòng base duy nhất khớp với tên repo trên GitHub
    base: '/AI/', 

    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), tailwindcss()],
    define: {
      // Nếu bạn đã chuyển sang dùng Groq, hãy đổi tên biến ở đây cho khớp với code .tsx
      'process.env.GROQ_API_KEY': JSON.stringify(env.GROQ_API_KEY),
      // Hoặc giữ nguyên nếu bạn vẫn đang dùng Gemini
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
