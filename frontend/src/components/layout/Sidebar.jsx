// src/components/layout/Sidebar.jsx — con soporte dark/light mode y usuario autenticado

import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Leaf, Home, ScanLine, ClipboardList, BarChart2, Map, Settings, LogOut, User } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../context/AuthContext'

const NAV_ITEMS = [
  { label: 'Inicio',        path: '/',          icon: Home,          badge: null,                            disabled: false, exact: true  },
  { label: 'Analizar Hoja', path: '/analyze',   icon: ScanLine,      badge: { text: 'MVP', color: 'green' }, disabled: false, exact: false },
  { label: 'Historial',     path: '/history',   icon: ClipboardList, badge: null,                            disabled: false },
  { label: 'Dashboard',     path: '/dashboard', icon: BarChart2,     badge: { text: 'Próximamente', color: 'gray' }, disabled: true },
  { label: 'Mapa de Finca', path: '/map',       icon: Map,           badge: null,                            disabled: false },
  { label: 'Configuración', path: '/settings',  icon: Settings,      badge: null,                            disabled: false },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    // bg-white en light mode, bg-gray-900 en dark mode
    // border-gray-200 / dark:border-gray-800 para el borde derecho
    <aside className="fixed top-0 left-0 h-full w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col z-50">

      {/* ── LOGO ───────────────────────────────────────────────────── */}
      <div className="px-6 py-6 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl gradient-vine flex items-center justify-center shadow-glow flex-shrink-0">
            <Leaf size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-gray-900 dark:text-white font-bold text-lg leading-none">
              Detect<span className="text-gradient-vine">VID</span>
            </h1>
            <p className="text-gray-500 dark:text-gray-500 text-xs mt-0.5">Agricultura de Precisión</p>
          </div>
        </div>
      </div>

      {/* ── NAVEGACIÓN ─────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <p className="text-gray-400 dark:text-gray-600 text-xs font-semibold uppercase tracking-wider px-3 mb-3">
          Módulos
        </p>
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}
        </ul>
      </nav>

      {/* ── PIE — usuario + logout ──────────────────────────────────── */}
      <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-800">
        {user ? (
          <div className="flex items-center gap-2.5">
            {/* Avatar con inicial del nombre */}
            <div className="w-8 h-8 rounded-full gradient-vine flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold uppercase">
                {user.name?.charAt(0) || <User size={14} />}
              </span>
            </div>
            {/* Nombre y email */}
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 dark:text-white text-xs font-semibold truncate">{user.name}</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs truncate">{user.email}</p>
            </div>
            {/* Botón logout */}
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0 p-1 rounded"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-gray-400 dark:text-gray-600 text-xs">v1.0.0 MVP</span>
            <span className="text-gray-300 dark:text-gray-700 text-xs">© 2025</span>
          </div>
        )}
      </div>
    </aside>
  )
}

function NavItem({ item }) {
  const Icon = item.icon

  if (item.disabled) {
    return (
      <li>
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg opacity-40 cursor-not-allowed text-gray-500 dark:text-gray-400"
          title="Disponible en próximas versiones"
        >
          <Icon size={18} className="flex-shrink-0" />
          <span className="text-sm font-medium flex-1">{item.label}</span>
          {item.badge && <Badge text={item.badge.text} color="gray" />}
        </div>
      </li>
    )
  }

  return (
    <li>
      <NavLink
        to={item.path}
        end={item.exact}
        className={({ isActive }) =>
          clsx(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150',
            isActive
              ? 'bg-emerald-700/20 text-emerald-700 dark:text-emerald-400 border-l-2 border-emerald-600 dark:border-emerald-500 pl-[10px]'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/60'
          )
        }
      >
        <Icon size={18} className="flex-shrink-0" />
        <span className="text-sm font-medium flex-1">{item.label}</span>
        {item.badge && <Badge text={item.badge.text} color={item.badge.color} />}
      </NavLink>
    </li>
  )
}

function Badge({ text, color = 'gray' }) {
  const colorClasses = {
    green: 'bg-emerald-700/30 text-emerald-700 dark:text-emerald-400 border border-emerald-600/50',
    gray:  'bg-gray-200 dark:bg-gray-700/30 text-gray-500 dark:text-gray-500 border border-gray-300 dark:border-gray-700/50',
  }
  return (
    <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', colorClasses[color] || colorClasses.gray)}>
      {text}
    </span>
  )
}
