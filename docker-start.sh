#!/bin/sh
# Arranca backend (Express :4000) + frontend (Next.js :3000) y Nginx (:80) en primer plano.
set -e

# A propósito NO se corre "prisma db push" al arrancar: schema.ejec.prisma
# convive con una tabla legado "User" no declarada en el esquema, y un push
# a ciegas la eliminaría. El esquema de ambas bases (Planeación y Ejecución)
# se gestiona manualmente (migraciones/scripts SQL), no en cada despliegue.

# Backend Express
node /app/backend/dist/index.js &
BACKEND_PID=$!

# Frontend Next.js (necesita cwd = frontend)
cd /app/frontend
/app/node_modules/.bin/next start -p 3000 &
FRONTEND_PID=$!
cd /app

# Si backend o frontend mueren (ej. faltan variables de entorno y el proceso
# hace exit(1)), el contenedor debe morir con ellos -> así "restart:
# unless-stopped" lo reinicia, en vez de quedar "vivo" con Nginx sirviendo
# 502/504 para siempre detrás de un proceso que ya no existe.
( wait "$BACKEND_PID"; echo "[docker-start] backend terminó, apagando contenedor"; kill -TERM 1 ) &
( wait "$FRONTEND_PID"; echo "[docker-start] frontend terminó, apagando contenedor"; kill -TERM 1 ) &

# Nginx en primer plano (mantiene vivo el contenedor)
nginx -g "daemon off;"
