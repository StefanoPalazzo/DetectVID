FROM node:20-alpine

WORKDIR /app

# Instalar dependencias necesarias para compilar módulos nativos si los hubiera (ej. bcrypt, prisma binaries)
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependencias
RUN npm install

# Generar el cliente de Prisma para la arquitectura del contenedor (linux-musl)
RUN npx prisma generate

# Copiar el código fuente
COPY . .

EXPOSE 3001

# Script de inicio: corre las migraciones antes de arrancar el servidor
CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev"]
