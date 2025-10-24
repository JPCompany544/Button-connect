import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'not IE 11'],
      modernPolyfills: true,
      externalSystemJS: false,
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],
  build: { target: ['es2017', 'safari13'] },
  server: { host: true },
})
