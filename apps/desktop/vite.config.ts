import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      '@main': path.resolve(__dirname, './src/main'),
      '@preload': path.resolve(__dirname, './src/preload'),
      '@nexus-play/core': path.resolve(__dirname, '../../packages/core/src'),
      "@nexus-play/plugins": path.resolve(__dirname, '../../packages/plugins/src')
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'src/main/index.ts',
        onstart(args) {
          args.startup(['.', '--ozone-platform-hint=auto', '--no-sandbox'])
        },
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['better-sqlite3'],
              output: {
                entryFileNames: 'index.js'
              }
            }
          }
        }
      },
      preload: {
        input: 'src/preload/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              output: {
                entryFileNames: 'index.js'
              }
            }
          }
        }
      },
      renderer: {},
    }),
  ],
})
