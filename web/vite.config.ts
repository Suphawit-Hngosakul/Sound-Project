import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // worker ของ maplibre ถูกชี้ตำแหน่งเองที่ src/maplibreWorker.ts — ต้องเป็น ES module
  // เพราะ maplibre สร้างด้วย new Worker(url, { type: 'module' })
  worker: { format: 'es' },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  // preview เสิร์ฟไฟล์ที่ build แล้ว ต้อง proxy เหมือนกัน ไม่งั้นทดสอบ build จริงกับ API ไม่ได้
  preview: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
