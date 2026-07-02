#!/bin/bash
# deploy/pm2.sh — Start/restart backend with PM2
# Run: sudo bash deploy/pm2.sh

set -euo pipefail
APP_DIR="/var/www/dal-system"

echo "[PM2] Installing dependencies..."
cd ${APP_DIR}/backend
npm install --production --silent

echo "[PM2] Generating Prisma client..."
npx prisma generate

echo "[PM2] Copying ecosystem config..."
# Copy ecosystem config from project deploy/ dir to app root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "${SCRIPT_DIR}/ecosystem.config.js" ${APP_DIR}/

echo "[PM2] Starting application..."
cd ${APP_DIR}
pm2 start ecosystem.config.js --env production

echo "[PM2] Saving PM2 process list..."
pm2 save

echo "[PM2] Setting up PM2 startup..."
pm2 startup systemd -u root --hp /root

echo ""
echo "[PM2] ✅ Backend started"
pm2 status dal-backend
echo ""
echo "Useful commands:"
echo "  pm2 logs dal-backend        # Tail logs"
echo "  pm2 restart dal-backend     # Restart"
echo "  pm2 reload dal-backend      # Zero-downtime reload (cluster mode)"
echo "  pm2 stop dal-backend        # Stop"
echo "  pm2 monit                   # Real-time monitoring"
