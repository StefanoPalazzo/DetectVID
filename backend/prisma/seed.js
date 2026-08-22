// prisma/seed.js
// ─────────────────────────────────────────────────────────────────────────────
// Seed: carga datos iniciales en la base de datos.
// Ejecutar con: npm run db:seed
// Requiere credenciales de admin provistas por variables de entorno.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path')
const dotenv = require('dotenv')
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

// Load local credentials for direct runs without replacing Docker-provided environment variables.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  const adminEmail = process.env.SEED_ADMIN_EMAIL
  const adminPassword = process.env.SEED_ADMIN_PASSWORD
  if (!adminEmail || !adminPassword) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required to run the admin seed.')
  }

  // Hashear password con cost factor 12 (recomendado para producción)
  const passwordHash = await bcrypt.hash(adminPassword, 12)

  // Crear usuario admin — upsert para que sea idempotente (seguro de re-ejecutar)
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'Administrador',
      email: adminEmail,
      password_hash: passwordHash,
      role: 'ADMIN',
    },
  })

  console.log('✅ Usuario admin creado:', admin.email)
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
