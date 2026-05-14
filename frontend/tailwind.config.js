// tailwind.config.js
// Configuración central de Tailwind CSS
// Aquí definimos la paleta de colores personalizada "vine" (vid) y otras extensiones

/** @type {import('tailwindcss').Config} */
export default {
  // darkMode: 'class' significa que el modo oscuro se activa cuando
  // el elemento <html> tiene la clase "dark" (lo maneja ThemeContext.jsx).
  // Esto nos da control total — el usuario elige, no el sistema operativo.
  darkMode: 'class',

  // content: le dice a Tailwind qué archivos escanear para generar solo las clases que usamos
  // Esto reduce el tamaño del CSS final en producción (tree-shaking de CSS)
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],

  theme: {
    extend: {
      // Paleta "vine" — inspirada en el viñedo y la naturaleza
      // Escala de 50 (muy claro) a 950 (muy oscuro)
      colors: {
        vine: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d', // ← COLOR PRINCIPAL DE MARCA
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
      },

      // Tipografía: usamos Inter (importado en index.html vía Google Fonts)
      // El array garantiza fallbacks si Inter no carga
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },

      // Sombra personalizada con glow verde para elementos destacados
      boxShadow: {
        'glow':    '0 0 20px rgba(22, 163, 74, 0.3)',
        'glow-lg': '0 0 40px rgba(22, 163, 74, 0.2)',
      },

      // Animaciones personalizadas para el loader de análisis
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':  'spin 3s linear infinite',
      },
    },
  },

  plugins: [],
}
