# Etapa 1: Build
FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Las variables de entorno en Vite deben empezar con VITE_ y pasarse en tiempo de compilación.
# En este caso, hacemos que la API apunte al mismo dominio (el proxy Nginx se encarga del ruteo)
ENV VITE_API_URL=/api
ENV VITE_ML_API_URL=/api/ml
RUN npm run build

# Etapa 2: Serve con Nginx
FROM nginx:alpine

# Copiamos la configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiamos el build de Vite a la carpeta de html de Nginx
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
