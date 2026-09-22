#!/bin/bash
# Aplica labels de Traefik por SSH/Swarm para SigRoute (por si Dokploy no
# conserva los labels del docker-compose.yml sobre el servicio real).
# Dominio: sigroute.grupo-santacruz.com
#
# Uso:
#   ./deploy.sh [SERVICE_NAME]
# Si no se pasa SERVICE_NAME, usa el nombre que asignó Dokploy al crear
# la aplicación (ver el id en el panel de Dokploy).

set -euo pipefail

SERVICE_NAME="${1:-sigroute-sigrouteapp-kpkfv4}"

docker service update \
  --label-add 'traefik.enable=true' \
  --label-add 'traefik.docker.network=dokploy-network' \
  --label-add 'traefik.http.routers.sigroute.rule=Host(`sigroute.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.sigroute.entrypoints=websecure' \
  --label-add 'traefik.http.routers.sigroute.tls=true' \
  --label-add 'traefik.http.routers.sigroute.tls.certresolver=letsencrypt' \
  --label-add 'traefik.http.routers.sigroute.service=sigroute' \
  --label-add 'traefik.http.services.sigroute.loadbalancer.server.port=80' \
  --label-add 'traefik.http.routers.sigroute-web.rule=Host(`sigroute.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.sigroute-web.entrypoints=web' \
  --label-add 'traefik.http.routers.sigroute-web.middlewares=sigroute-redirect-https' \
  --label-add 'traefik.http.middlewares.sigroute-redirect-https.redirectscheme.scheme=https' \
  --label-add 'traefik.http.middlewares.sigroute-redirect-https.redirectscheme.permanent=true' \
  "$SERVICE_NAME"

echo "Labels aplicados correctamente a $SERVICE_NAME"
