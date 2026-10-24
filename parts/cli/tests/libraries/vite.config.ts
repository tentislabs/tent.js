import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Tailwind CSS as its own documents add it for Vite: its plugin, and `@import "tailwindcss"` in a stylesheet.
export default defineConfig({
  plugins: [tailwindcss()],
})
