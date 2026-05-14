// src/pages/Register.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Página de registro de DetectVID.
// Incluye validación frontend con feedback en tiempo real.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Leaf, User, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// ── Reglas de validación de password ─────────────────────────────────────────
// Deben coincidir con las del backend (authRoutes.js) para feedback inmediato
const PASSWORD_RULES = [
  { id: 'length',  label: 'Al menos 8 caracteres',    test: (p) => p.length >= 8  },
  { id: 'upper',   label: 'Al menos una mayúscula',   test: (p) => /[A-Z]/.test(p) },
  { id: 'number',  label: 'Al menos un número',       test: (p) => /[0-9]/.test(p) },
]

export default function Register() {
  const navigate    = useNavigate()
  const { register } = useAuth()

  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
  })
  const [showPassword, setShowPassword]         = useState(false)
  const [showConfirmPassword, setShowConfirm]   = useState(false)
  const [loading, setLoading]                   = useState(false)
  const [error, setError]                       = useState('')

  // Validar password en tiempo real para mostrar indicadores
  const passwordChecks = PASSWORD_RULES.map(rule => ({
    ...rule,
    passed: rule.test(form.password),
  }))
  const passwordValid   = passwordChecks.every(r => r.passed)
  const passwordsMatch  = form.password === form.confirmPassword && form.confirmPassword !== ''

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    if (error) setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()

    // Validaciones frontend antes de enviar
    if (!passwordValid) {
      setError('La contraseña no cumple los requisitos.')
      return
    }
    if (!passwordsMatch) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    setError('')

    const result = await register({
      name:     form.name.trim(),
      email:    form.email,
      password: form.password,
    })

    if (result.success) {
      navigate('/', { replace: true })
    } else {
      setError(result.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl gradient-vine flex items-center justify-center shadow-glow mb-4">
            <Leaf size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Detect<span className="text-gradient-vine">VID</span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Agricultura de Precisión</p>
        </div>

        {/* ── Card ─────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
            Crear cuenta
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            Completá tus datos para registrarte
          </p>

          {/* ── Error global ─────────────────────────────────────────── */}
          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 rounded-lg px-4 py-3 mb-5 text-sm">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">

            {/* Nombre */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Nombre completo
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  id="name" name="name" type="text" autoComplete="name"
                  value={form.name} onChange={handleChange}
                  placeholder="Juan Pérez"
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  id="email" name="email" type="email" autoComplete="email"
                  value={form.email} onChange={handleChange}
                  placeholder="tu@email.com"
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  id="password" name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.password} onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
                  required
                />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  aria-label={showPassword ? 'Ocultar' : 'Mostrar'}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Indicadores de seguridad — se muestran al escribir */}
              {form.password && (
                <ul className="mt-2 space-y-1">
                  {passwordChecks.map(rule => (
                    <li key={rule.id} className={`flex items-center gap-1.5 text-xs transition-colors ${rule.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      <CheckCircle2 size={12} />
                      {rule.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Confirmar password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Confirmar contraseña
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  id="confirmPassword" name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.confirmPassword} onChange={handleChange}
                  placeholder="••••••••"
                  className={`w-full pl-9 pr-10 py-2.5 bg-gray-50 dark:bg-gray-800 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-colors ${
                    form.confirmPassword
                      ? passwordsMatch
                        ? 'border-emerald-400 dark:border-emerald-600 focus:ring-emerald-500'
                        : 'border-red-300 dark:border-red-700 focus:ring-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:ring-emerald-500'
                  }`}
                  required
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  aria-label={showConfirmPassword ? 'Ocultar' : 'Mostrar'}>
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.confirmPassword && !passwordsMatch && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1">Las contraseñas no coinciden.</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !form.name || !form.email || !passwordValid || !passwordsMatch}
              className="w-full mt-2 gradient-vine text-white font-semibold py-2.5 px-4 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creando cuenta…
                </>
              ) : (
                'Crear cuenta'
              )}
            </button>
          </form>
        </div>

        {/* ── Link a login ─────────────────────────────────────────────── */}
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          ¿Ya tenés cuenta?{' '}
          <Link to="/login" className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
            Iniciá sesión
          </Link>
        </p>

        {/* ── Footer académico ─────────────────────────────────────────── */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-8">
          Universidad de Mendoza · Proyecto de Tesis · Stefano Palazzo
        </p>
      </div>
    </div>
  )
}
