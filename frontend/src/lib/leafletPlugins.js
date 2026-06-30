import L from 'leaflet'

if (typeof window !== 'undefined') {
  window.L = L
}

globalThis.L = L

function loadClassicScript(src) {
  if (typeof document === 'undefined') return Promise.resolve()

  const existing = document.querySelector(`script[data-detectvid-src="${src}"]`)
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve()
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', reject, { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.dataset.detectvidSrc = src
    script.onload = () => {
      script.dataset.loaded = 'true'
      resolve()
    }
    script.onerror = () => reject(new Error(`Could not load ${src}`))
    document.head.appendChild(script)
  })
}

await loadClassicScript('/vendor/leaflet-geoman.js')
await import('leaflet-control-geocoder')

export default L
