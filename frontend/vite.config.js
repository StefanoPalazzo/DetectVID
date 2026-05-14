// vite.config.js
// Configuración de Vite — el bundler/dev-server que usamos
// @vitejs/plugin-react habilita Fast Refresh y el compilador JSX de React

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
