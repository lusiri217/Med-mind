import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// /api 代理仅用于本地同时跑 Express 后端做对照。
// 生产静态产物 dist/ 完全在浏览器内运行，不依赖任何后端接口。
export default defineConfig({ plugins: [react()], server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } } });
