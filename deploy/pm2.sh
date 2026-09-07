#!/bin/bash
# deploy/pm2.sh — Start/restart backend with PM2
#
#   sudo bash deploy/pm2.sh staging
#   sudo bash deploy/pm2.sh production

set -euo pipefail
# shellcheck source=env.sh
source "$(dirname "$0")/env.sh" "${1:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

confirm_production

echo "[PM2] Installing dependencies..."
cd "${APP_DIR}/backend"
npm install --production --silent

echo "[PM2] Generating Prisma client..."
npx prisma generate

echo "[PM2] Copying ecosystem config..."
cp "${SCRIPT_DIR}/ecosystem.config.js" "${APP_DIR}/"

echo "[PM2] Starting ${PM2_NAME}..."
cd "${APP_DIR}"
# DAL_ENV dibaca ecosystem.config.js untuk memilih nama proses, folder, dan
# port. Tanpa itu berkas konfigurasinya menolak jalan, bukan menebak.
DAL_ENV="${DAL_ENV}" pm2 start ecosystem.config.js

echo "[PM2] Saving PM2 process list..."
pm2 save

echo "[PM2] Setting up PM2 startup..."
pm2 startup systemd -u root --hp /root

echo ""
echo "[PM2] ✅ ${PM2_NAME} started"
pm2 status "${PM2_NAME}"
echo ""
echo "Useful commands:"
echo "  pm2 logs ${PM2_NAME}        # Tail logs"
echo "  pm2 restart ${PM2_NAME}     # Restart"
echo "  pm2 reload ${PM2_NAME}      # Zero-downtime reload (cluster mode)"
echo "  pm2 stop ${PM2_NAME}        # Stop"
echo "  pm2 monit                   # Real-time monitoring"
