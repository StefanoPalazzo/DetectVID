# 🔐 Sistema de Autenticación — DetectVID Backend

Documentación del módulo de autenticación para el proyecto de tesis.
**Universidad de Mendoza | Stefano Palazzo | 2025**

---

## Stack tecnológico

| Tecnología | Versión | Rol |
|---|---|---|
| Node.js + Express | ^4.19 | Servidor HTTP |
| PostgreSQL | 15 | Base de datos |
| Prisma ORM | ^5.14 | Acceso a DB (previene SQL injection) |
| bcryptjs | ^2.4 | Hash de contraseñas |
| jsonwebtoken | ^9.0 | Tokens de sesión (JWT) |
| express-validator | ^7.1 | Validación de inputs |
| helmet | ^7.1 | Headers de seguridad HTTP |
| express-rate-limit | ^7.3 | Protección contra fuerza bruta |
| cookie-parser | ^1.4 | Lectura de cookies HttpOnly |

---

## Estructura de directorios

```
backend/
├── prisma/
│   ├── schema.prisma      ← Definición del modelo de datos
│   ├── seed.js            ← Datos iniciales (usuario admin)
│   └── migrations/        ← Historial de cambios en la DB (auto-generado)
├── src/
│   ├── server.js          ← Punto de entrada, configuración Express
│   ├── routes/
│   │   └── authRoutes.js  ← Endpoints + reglas de validación
│   ├── controllers/
│   │   └── authController.js ← Lógica de negocio (register, login, logout, me)
│   ├── middleware/
│   │   └── authMiddleware.js ← Protección de rutas (authenticate, authorize)
│   └── utils/
│       └── jwt.js         ← Generación/verificación de tokens y cookies
├── .env                   ← Variables de entorno (NO commitear)
├── .env.example           ← Template del .env (sí commitear)
└── package.json
```

---

## Setup inicial

### 1. Instalar dependencias
```bash
cd backend
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con los valores reales
```

### 3. Crear la base de datos en PostgreSQL
```bash
psql postgres -c "CREATE DATABASE detectvid_db;"
```

### 4. Aplicar migraciones (crea las tablas)
```bash
npm run db:migrate
```

### 5. Cargar datos iniciales
```bash
npm run db:seed
# Crea: admin@detectvid.com / Admin1234!
```

### 6. Iniciar en desarrollo
```bash
npm run dev
# Servidor en http://localhost:3001
```

---

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/auth/register` | No | Crear cuenta nueva |
| `POST` | `/api/auth/login` | No | Iniciar sesión |
| `POST` | `/api/auth/logout` | No | Cerrar sesión |
| `GET` | `/api/auth/me` | ✅ Sí | Datos del usuario actual |
| `GET` | `/health` | No | Estado del servidor |

### POST /api/auth/register
```json
// Request
{ "name": "Juan Pérez", "email": "juan@email.com", "password": "MiPass123" }

// Response 201
{ "success": true, "message": "Cuenta creada correctamente.", "user": { "id": "...", "name": "Juan Pérez", "email": "juan@email.com", "role": "PRODUCTOR" } }
```

### POST /api/auth/login
```json
// Request
{ "email": "juan@email.com", "password": "MiPass123" }

// Response 200 — también setea cookie HttpOnly "auth_token"
{ "success": true, "message": "Sesión iniciada.", "user": { ... } }
```

---

## Seguridad: decisiones de diseño

### ¿Por qué HttpOnly cookies y no localStorage?

localStorage es accesible desde JavaScript. Si el sitio tiene una vulnerabilidad XSS (Cross-Site Scripting), un atacante puede robar el token con `localStorage.getItem('token')`.

Las cookies con `httpOnly: true` son **invisibles para JavaScript** — el browser las envía automáticamente pero ningún script puede leerlas. Es el método recomendado por OWASP.

### ¿Por qué bcrypt con cost factor 12?

bcrypt es un algoritmo de hash diseñado para ser **lento a propósito**. Con cost factor 12, hashear una contraseña toma ~300ms en hardware moderno. Esto hace que un ataque de diccionario requiera años de cómputo en vez de minutos.

MD5 y SHA-256 son rápidos → malos para contraseñas. bcrypt es lento → perfecto.

### ¿Por qué mensajes de error genéricos en login?

"Email o contraseña incorrectos." — no decimos cuál es el error.

Si dijéramos "Email no encontrado", un atacante podría enumerar qué emails existen en el sistema (user enumeration attack). El mensaje genérico previene esto.

### ¿Por qué Prisma previene SQL injection?

Prisma usa **prepared statements** internamente. Los datos del usuario NUNCA se concatenan directamente a una query SQL — siempre van como parámetros separados que la DB trata como datos, no como código.

### Rate limiting

Máximo 20 requests cada 15 minutos por IP en rutas de auth. Previene ataques de fuerza bruta automatizados.

---

## Modelo de datos

```prisma
model User {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  password_hash String   // NUNCA texto plano
  role          Role     @default(PRODUCTOR)
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt
}

enum Role {
  ADMIN
  PRODUCTOR
}
```

---

## Expansión futura (preparado pero no implementado)

- [ ] Historial de análisis por usuario (`Analysis` model en schema)
- [ ] Recuperación de contraseña por email (Nodemailer)
- [ ] Verificación de email al registrarse
- [ ] OAuth (Google, GitHub) con Passport.js
- [ ] Refresh tokens para sesiones más largas
- [ ] Suscripciones SaaS por rol
