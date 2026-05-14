// prisma/seed.js
// ─────────────────────────────────────────────────────────────────────────────
// Seed: carga datos iniciales en la base de datos.
// Ejecutar con: npm run db:seed
// Crea un usuario admin por defecto para desarrollo.
// ─────────────────────────────────────────────────────────────────────────────

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  // Hashear password con cost factor 12 (recomendado para producción)
  const passwordHash = await bcrypt.hash('Admin1234!', 12)

  // Crear usuario admin — upsert para que sea idempotente (seguro de re-ejecutar)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@detectvid.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@detectvid.com',
      password_hash: passwordHash,
      role: 'ADMIN',
    },
  })

  console.log('✅ Usuario admin creado:', admin.email)
  console.log('   Password temporal: Admin1234!')
  console.log('   ⚠️  Cambiar en producción')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
