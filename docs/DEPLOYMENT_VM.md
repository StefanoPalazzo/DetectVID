# DetectVID — despliegue en VM con Docker

Guía para dejar DetectVID corriendo en una VM Ubuntu/Debian usando Docker Compose.

## 1. Requisitos de VM

Recomendado:

- Ubuntu 22.04/24.04 o Debian 12.
- 2 vCPU mínimo; 4 vCPU recomendado para inferencia ML.
- 4 GB RAM mínimo; 8 GB recomendado.
- 20 GB de disco libre mínimo.
- Puertos abiertos: `80` HTTP y `443` HTTPS si usás reverse proxy/TLS.
- Dominio opcional apuntando a la IP pública o proxy elegido.

## 2. Conectar por SSH

```bash
ssh usuario@IP_DEL_SERVIDOR
```

Ejemplo:

```bash
ssh ubuntu@203.0.113.10
```

## 3. Instalar dependencias

```bash
sudo apt update
sudo apt install -y git ca-certificates curl gnupg ufw

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Cerrar y volver a abrir SSH para tomar el grupo `docker`.

Firewall básico:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 4. Clonar proyecto

```bash
git clone <repo-url>
cd DetectVID
```

## 5. Configurar variables

```bash
cp .env.example .env
nano .env
```

Variables importantes:

| Variable | Descripción |
|---|---|
| `POSTGRES_PASSWORD` | Cambiar sí o sí en VM. |
| `JWT_SECRET` | Generar con `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`. |
| `PUBLIC_BASE_URL` | URL pública final, ej. `https://detectvid.tudominio.com`. |
| `FRONTEND_URLS` | Orígenes permitidos por CORS. Incluir la URL pública. |
| `STORAGE_PROVIDER` | Usar `local` para MVP en VM. |

Nunca subir `.env` a git.

## 6. Levantar app

```bash
docker compose up -d --build
```

Ver estado:

```bash
docker compose ps
```

## 7. Logs

```bash
docker compose logs -f
```

Por servicio:

```bash
docker compose logs -f backend
docker compose logs -f ml
docker compose logs -f frontend
```

## 8. Reiniciar / detener

```bash
docker compose restart
```

```bash
docker compose down
```

No uses `docker compose down -v` salvo que quieras borrar la base y uploads.

## 9. Actualizar app

```bash
git pull
docker compose up -d --build
```

El backend ejecuta `prisma migrate deploy` al arrancar.

## 10. Migraciones y seed

El contenedor backend aplica migraciones automáticamente. Para cargar el usuario demo/admin:

```bash
docker compose exec backend npm run db:seed
```

Credencial demo del seed:

- email: `admin@detectvid.com`
- password: `Admin1234!`

Cambiar o eliminar en producción.

## 11. Verificar funcionamiento

Frontend:

```bash
curl -I http://localhost
```

ML API vía Nginx:

```bash
curl http://localhost/api/ml/health
```

Backend directo desde contenedor:

```bash
docker compose exec backend node -e "fetch('http://localhost:3001/health').then(r=>r.text()).then(console.log)"
```

## 12. Troubleshooting

### Puerto 80 ocupado

```bash
sudo lsof -i :80
```

Detener el servicio conflictivo o cambiar el puerto en `docker-compose.yml`.

### Docker daemon no corre

```bash
sudo systemctl status docker
sudo systemctl start docker
```

### DB no conecta

```bash
docker compose logs db
docker compose logs backend
```

Revisar `POSTGRES_*` y `DATABASE_URL` construida por Compose.

### ML tarda o timeout

- Verificar que exista un checkpoint compatible en `ml/checkpoints`.
- Revisar `docker compose logs ml`.
- Aumentar CPU/RAM de la VM si la inferencia tarda demasiado.

### Frontend no llega al backend

- Usar la URL pública en `PUBLIC_BASE_URL` y `FRONTEND_URLS`.
- Verificar que Nginx tenga `/api/` y `/api/ml/` proxy funcionando.
- Revisar cookies: auth usa cookie HttpOnly.

### Imágenes no aparecen

- Con `STORAGE_PROVIDER=local`, verificar volumen `backend_uploads`.
- `PUBLIC_BASE_URL` debe apuntar al dominio/IP público que sirve Nginx.

## 13. Estado actual de demo/tesis

Para la demo actual, la VM quedó preparada para funcionar en red privada/ZeroTier:

- URL VM privada: `http://10.201.0.138`
- Usuario demo: `admin@detectvid.com`
- Password demo: `Admin1234!`
- Mobile KMP apunta por defecto a `http://10.201.0.138`.

Importante: esto no reemplaza un dominio público. Si el teléfono no está en ZeroTier o la VM no recibe una IP pública enrutable, iOS/Android no van a poder llegar al backend desde internet normal.

## 14. Producción opcional

Para HTTPS, poner delante Caddy, Traefik, Nginx + Certbot o Cloudflare Tunnel.

Recomendado:

- Backups periódicos de PostgreSQL.
- Backup del volumen `backend_uploads`.
- Logs persistentes o exportados.
- Dominio estable.
- No exponer `backend` ni `ml` directo; exponer solo Nginx/HTTPS.
