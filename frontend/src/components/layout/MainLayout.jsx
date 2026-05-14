// src/components/layout/MainLayout.jsx
// Layout principal con soporte dark/light mode.

import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import Footer from './Footer'

export default function MainLayout() {
  return (
    // dark:bg-gray-950 = fondo casi negro en modo oscuro
    // bg-gray-100      = fondo gris claro en modo claro
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950 overflow-hidden">

      <Sidebar />

      {/* ml-64 compensa el sidebar fixed de 256px */}
      <div className="flex flex-col flex-1 ml-64 min-h-screen overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        <Footer />
      </div>
    </div>
  )
}
