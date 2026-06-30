// src/pages/Settings.jsx
// Página de Configuración — perfil real y datos del proyecto DetectVID.

import React from 'react'
import {
  Settings, User, GraduationCap, Cpu, Globe,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function SettingsPage() {
  const { user } = useAuth()

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Settings size={16} className="text-gray-500 dark:text-gray-400" />
        </div>
        <div>
          <h1 className="text-gray-900 dark:text-white font-bold text-2xl">Configuración</h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm">Preferencias y configuración del sistema</p>
        </div>
      </div>

      <SettingsSection icon={<User size={16} />} title="Perfil" badge="Cuenta">
        <div className="space-y-3">
          <FieldRow label="Nombre" value={user?.name || 'Usuario'} />
          <FieldRow label="Email" value={user?.email || 'No disponible'} />
          <FieldRow label="Rol" value={formatRole(user?.role)} />
          <FieldRow label="Institución" value="Universidad de Mendoza" />
        </div>
      </SettingsSection>

      <SettingsSection icon={<GraduationCap size={16} />} title="Información del Proyecto">
        <div className="space-y-3">
          <FieldRow label="Proyecto" value="DetectVID" />
          <FieldRow label="Institución" value="Universidad de Mendoza" />
          <FieldRow label="Autor" value="Stefano Palazzo" />
          <FieldRow label="Carrera" value="Ingeniería" />
          <FieldRow label="Período" value="2026" />
          <FieldRow label="Tipo" value="Proyecto de Tesis Final" />
        </div>
      </SettingsSection>

      <SettingsSection icon={<Cpu size={16} />} title="Información del Sistema">
        <div className="space-y-3">
          <FieldRow label="Versión" value="v2.0.5 MVP" />
          <FieldRow label="Modelo IA" value="EfficientNet-B0 · exp44_4cls_field_eff_quality_aug" />
          <FieldRow label="Frontend" value="React + Vite + Tailwind CSS" />
          <FieldRow label="Backend" value="Express + PostgreSQL + FastAPI ML" />
          <FieldRow label="Enfermedades" value="Oídio, Peronóspora, Otras, Sana" />
          <FieldRow label="Estado" value="MVP funcional" highlight />
        </div>
      </SettingsSection>

      <SettingsSection icon={<Globe size={16} />} title="Preferencias" badge="Próximamente">
        <div className="space-y-3 opacity-50 pointer-events-none">
          <FieldRow label="Idioma" value="Español" />
          <FieldRow label="Umbral mínimo de confianza" value="80%" />
          <FieldRow label="Notificaciones" value="Activadas" />
        </div>
        <p className="text-gray-400 dark:text-gray-600 text-xs mt-2">
          Configuración avanzada disponible en próximas versiones.
        </p>
      </SettingsSection>

    </div>
  )
}

function formatRole(role) {
  if (!role) return 'Productor / Investigador'
  return role === 'ADMIN' ? 'Administrador' : 'Usuario'
}

function SettingsSection({ icon, title, badge, children }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-emerald-500">{icon}</span>
        <h2 className="text-gray-900 dark:text-white font-semibold">{title}</h2>
        {badge && (
          <span className="bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 ml-auto">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function FieldRow({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 border-b border-gray-200 dark:border-gray-800/50 last:border-0">
      <span className="text-gray-400 dark:text-gray-500 text-sm flex-shrink-0">{label}</span>
      <span className={`text-sm text-right ${highlight ? 'text-emerald-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
        {value}
      </span>
    </div>
  )
}
