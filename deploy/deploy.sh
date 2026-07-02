#!/bin/bash
# deploy/deploy.sh — Build and deploy DAL System
# Run from project root: bash deploy/deploy.sh [production|staging]
# Assumes server files already set up via setup.sh

set -euo pipefail

ENV="${1:-production}"
APP_DIR="/var/www/dal-system"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   DAL System — Deploy to ${ENV}          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── Step 1: Build Frontend ────────────────────────────────────────
echo "[1/5] Building frontend..."
cd "${PROJECT_ROOT}/frontend"
npm install --silent
npm run build
echo "  ✅ Frontend built: dist/"

# ─── Step 2: Copy Frontend to server ──────────────────────────────
echo "[2/5] Deploying frontend..."
rsync -av --delete "${PROJECT_ROOT}/frontend/dist/" "${APP_DIR}/frontend/"
echo "  ✅ Frontend deployed to ${APP_DIR}/frontend/"

# ─── Step 3: Copy Backend ─────────────────────────────────────────
echo "[3/5] Deploying backend..."
rsync -av --delete \
  --exclude='.env' \
  --exclude='node_modules/' \
  --exclude='logs/' \
  --exclude='storage/' \
  "${PROJECT_ROOT}/backend/" "${APP_DIR}/backend/"

# Install production deps
cd "${APP_DIR}/backend"
npm install --production --silent
npx prisma generate
echo "  ✅ Backend deployed to ${APP_DIR}/backend/"

# ─── Step 4: Database migration ───────────────────────────────────
echo "[4/5] Running database migrations..."
cd "${APP_DIR}/backend"
npx prisma migrate deploy
echo "  ✅ Migrations applied"

# ─── Step 5: Restart PM2 ─────────────────────────────────────────
echo "[5/5] Restarting backend (zero-downtime)..."
pm2 reload ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production
pm2 save
echo "  ✅ Backend restarted"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ✅ Deployment complete!                ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Verify:"
echo "  curl -s http://localhost:3001/health | python3 -m json.tool"
echo "  pm2 logs dal-backend --lines 30"
