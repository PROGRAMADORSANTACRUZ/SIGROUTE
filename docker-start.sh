#!/bin/sh
# Arranca backend (Express :4000) + frontend (Next.js :3000) y Nginx (:80) en primer plano.
set -e

# A propósito NO se corre "prisma db push" al arrancar: schema.ejec.prisma
# convive con una tabla legado "User" no declarada en el esquema, y un push
# a ciegas la eliminaría. El esquema de ambas bases (Planeación y Ejecución)
# se gestiona manualmente (migraciones/scripts SQL), no en cada despliegue.

# Backend Express
node /app/backend/dist/index.js &

# Frontend Next.js (necesita cwd = frontend)
cd /app/frontend
/app/node_modules/.bin/next start -p 3000 &

# Nginx en primer plano (mantiene vivo el contenedor)
cd /app
nginx -g "daemon off;"
