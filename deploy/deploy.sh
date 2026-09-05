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

# ─── Step 0: Backup ────────────────────────────────────────────────
# Migrasi mengubah skema, dan skrip penyimpanan yang dijalankan setelah deploy
# mengubah berkas secara permanen. Backup di sini bukan kehati-hatian berlebih:
# tanpa ini, tidak ada jalan pulang.
#
# SKIP_BACKUP=1 hanya untuk deploy pertama ke mesin kosong.
if [ "${SKIP_BACKUP:-0}" != "1" ]; then
  echo "[0/6] Backup sebelum deploy..."
  bash "${PROJECT_ROOT}/deploy/backup.sh"
else
  echo "[0/6] Backup DILEWATI (SKIP_BACKUP=1)"
fi

# ─── Step 1: Build Frontend ────────────────────────────────────────
echo "[1/6] Building frontend..."
cd "${PROJECT_ROOT}/frontend"
npm install --silent
npm run build
echo "  ✅ Frontend built: dist/"

# ─── Step 2: Copy Frontend to server ──────────────────────────────
echo "[2/6] Deploying frontend..."
rsync -av --delete "${PROJECT_ROOT}/frontend/dist/" "${APP_DIR}/frontend/"
echo "  ✅ Frontend deployed to ${APP_DIR}/frontend/"

# ─── Step 3: Copy Backend ─────────────────────────────────────────
echo "[3/6] Deploying backend..."
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
echo "[4/6] Running database migrations..."
cd "${APP_DIR}/backend"
npx prisma migrate deploy
echo "  ✅ Migrations applied"

# ─── Step 5b: Periksa kesiapan penyimpanan ────────────────────────
# Dijalankan SETELAH migrasi dan SEBELUM restart, sehingga kolom baru sudah ada
# tapi belum ada trafik yang mengandalkannya. Keluar dengan kode 1 kalau ada
# yang gagal, dan `set -e` menghentikan deploy di situ.
echo "[5b/6] Memeriksa kesiapan penyimpanan..."
cd "${APP_DIR}/backend"
npm run --silent storage:doctor

# ─── Step 5: Restart PM2 ─────────────────────────────────────────
echo "[5/6] Restarting backend (zero-downtime)..."
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
echo ""
echo "Migrasi penyimpanan (jalankan MANUAL, satu per satu, periksa di antaranya):"
echo "  cd ${APP_DIR}/backend"
echo "  npm run storage:dedupe                          # dry run"
echo "  npm run storage:dedupe   -- --apply"
echo "  npm run storage:manifest -- --apply"
echo "  npm run storage:manifest -- --verify            # HARUS diperiksa dulu"
echo "  npm run storage:manifest -- --verify --prune"
echo "  npm run storage:compress                        # dry run"
echo "  npm run storage:compress -- --apply"
echo ""
echo "Ketiganya mengubah berkas secara permanen dan sengaja TIDAK otomatis."
echo "Lihat deploy/RUNBOOK-STORAGE.md"
