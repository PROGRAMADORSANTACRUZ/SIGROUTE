<#
  Despliegue por SSH de SigRoute a un servidor Ubuntu con Docker Swarm + Traefik (Dokploy).

  Qué hace:
    1. Se conecta por SSH al servidor.
    2. Clona el repo si no existe, o lo actualiza (git reset --hard) si ya está.
    3. Construye la imagen y despliega el stack de swarm (docker-compose.yml).
    4. Reaplica los labels de Traefik sobre el servicio real (deploy.sh).

  Requisitos en el servidor:
    - Docker en modo Swarm (Dokploy ya lo tiene) y la red overlay "dokploy-network".

  Uso (desde PowerShell, en la carpeta del proyecto rutas_web):
    ./deploy.ps1
    ./deploy.ps1 -Server "adminsvr@20.121.178.90"
#>

param(
  # Usuario y host del servidor: "usuario@ip" o "usuario@dominio".
  [string]$Server = "adminsvr@20.121.178.90",

  # Carpeta del repo en el servidor.
  [string]$RepoDir = "/opt/sigroute",

  # URL del repositorio git.
  [string]$RepoUrl = "https://github.com/PROGRAMADORSANTACRUZ/SIGROUTE.git",

  # Rama a desplegar.
  [string]$Branch = "main",

  # Nombre del stack de Docker Swarm.
  [string]$StackName = "sigroute",

  # Nombre del servicio real que asignó Dokploy (para reaplicar labels).
  [string]$ServiceName = "sigroute-sigrouteapp-kpkfv4"
)

$ErrorActionPreference = "Stop"

# Comandos que se ejecutarán en el servidor remoto (Ubuntu).
$remote = @"
set -e
if [ ! -d "$RepoDir/.git" ]; then
  echo '==> Clonando repositorio...'
  sudo mkdir -p "$RepoDir"
  sudo chown -R \$(id -u):\$(id -g) "$RepoDir"
  git clone "$RepoUrl" "$RepoDir"
fi
cd "$RepoDir"
echo '==> Actualizando codigo...'
git fetch origin "$Branch"
git checkout "$Branch"
git reset --hard origin/"$Branch"

echo '==> Construyendo imagen y desplegando...'
docker stack deploy -c docker-compose.yml "$StackName" --prune

echo '==> Reaplicando labels de Traefik...'
chmod +x deploy.sh
./deploy.sh "$ServiceName" || echo 'deploy.sh omitido (revisa el nombre real del servicio en Dokploy)'

echo '==> Despliegue completado!'
echo '==> La app estara disponible en: https://sigroute.grupo-santacruz.com'
"@

Write-Host "Conectando a $Server..." -ForegroundColor Green
ssh $Server $remote

Write-Host "Despliegue completado exitosamente" -ForegroundColor Green
