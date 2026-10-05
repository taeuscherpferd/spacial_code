import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const certificatePath = fileURLToPath(
  new URL('./.cert/local-cert.pem', import.meta.url),
)
const keyPath = fileURLToPath(new URL('./.cert/local-key.pem', import.meta.url))
const localCertificate =
  existsSync(certificatePath) && existsSync(keyPath)
    ? { cert: readFileSync(certificatePath), key: readFileSync(keyPath) }
    : undefined

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    https: localCertificate,
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:4310',
        ws: true,
      },
    },
  },
})
