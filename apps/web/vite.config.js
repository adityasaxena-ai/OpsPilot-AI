import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    plugins: [react()],
    preview: {
        allowedHosts: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
            '/stream': {
                target: 'http://localhost:3001',
                changeOrigin: true,
                // SSE requires no buffering
                configure: function (proxy) {
                    proxy.on('proxyRes', function (proxyRes) {
                        proxyRes.headers['cache-control'] = 'no-cache';
                    });
                },
            },
        },
    },
});
