// src/components/layout/Footer.jsx — con soporte dark/light mode

import React from 'react'

export default function Footer() {
  return (
    <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-6 py-3 flex-shrink-0">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-gray-400 dark:text-gray-600 text-xs">DetectVID © 2024–2025</span>
        <span className="text-gray-500 dark:text-gray-500 text-xs font-medium text-center">
          Universidad de Mendoza&nbsp;
          <span className="text-gray-300 dark:text-gray-700">|</span>&nbsp;
          Proyecto de Tesis&nbsp;
          <span className="text-gray-300 dark:text-gray-700">|</span>&nbsp;
          Stefano Palazzo
        </span>
        <span className="text-gray-400 dark:text-gray-600 text-xs">v1.0.0 MVP</span>
      </div>
    </footer>
  )
}
