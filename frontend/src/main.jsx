// src/main.jsx
// Punto de entrada de la aplicación React
// createRoot es la API moderna de React 18 para montar la app
// StrictMode activa advertencias adicionales durante el desarrollo

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Monta la app en el div#root del index.html
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
