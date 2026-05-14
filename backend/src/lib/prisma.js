// src/lib/prisma.js
// ─────────────────────────────────────────────────────────────────────────────
// Singleton de PrismaClient.
// Un único pool de conexiones compartido por todos los controllers.
// ─────────────────────────────────────────────────────────────────────────────

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

module.exports = prisma
