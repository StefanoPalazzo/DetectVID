// postcss.config.js
// PostCSS procesa el CSS antes de enviarlo al browser
// tailwindcss genera las clases utilitarias
// autoprefixer agrega prefijos de vendor (-webkit-, -moz-) automáticamente

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
