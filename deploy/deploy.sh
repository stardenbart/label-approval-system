#!/bin/bash
# deploy/deploy.sh — Build and deploy DAL System
#
#   bash deploy/deploy.sh staging
#   bash deploy/deploy.sh production
#
# Lingkungan WAJIB disebutkan — tidak ada nilai bawaan. Sebelumnya bawaannya
# "production" dan argumen "staging" hanya mengubah teks di layar, sehingga
# mencoba di staging berarti menimpa server sungguhan. Lihat deploy/env.sh.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=env.sh
source "$(dirname "$0")/env.sh" "${1:-}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   DAL System — Deploy ke ${DAL_ENV}"
echo "╚══════════════════════════════════════════╝"

confirm_production

# ─── Step 0: Backup ────────────────────────────────────────────────
# Migrasi mengubah skema, dan skrip penyimpanan yang dijalankan setelah deploy
# mengubah berkas secara permanen. Tanpa ini, tidak ada jalan pulang.
#
# SKIP_BACKUP=1 hanya untuk deploy pertama ke mesin kosong.
if [ "${SKIP_BACKUP:-0}" != "1" ]; then
  echo "[0/6] Backup sebelum deploy..."
  bash "${PROJECT_ROOT}/deploy/backup.sh" "${DAL_ENV}"
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
# storage/ dikecualikan bukan sekadar demi kecepatan: berkas di sana bisa
# berupa hard link hasil dedup, dan rsync tanpa -H akan memekarkannya jadi
# salinan penuh. Berkas dokumen tidak pernah datang dari repo.
rsync -av --delete \
  --exclude='.env' \
  --exclude='node_modules/' \
  --exclude='logs/' \
  --exclude='storage/' \
  "${PROJECT_ROOT}/backend/" "${APP_DIR}/backend/"

cd "${APP_DIR}/backend"
npm install --production --silent
npx prisma generate
echo "  ✅ Backend deployed to ${APP_DIR}/backend/"

# ─── Step 4: Database migration ───────────────────────────────────
echo "[4/6] Running database migrations..."
npx prisma migrate deploy
echo "  ✅ Migrations applied"

# ─── Step 5: Periksa kesiapan penyimpanan ─────────────────────────
# Setelah migrasi (kolom baru sudah ada) dan sebelum restart (belum ada trafik
# yang mengandalkannya). Keluar dengan kode 1 kalau ada yang gagal, dan set -e
# menghentikan deploy di situ.
echo "[5/6] Memeriksa kesiapan penyimpanan..."
npm run --silent storage:doctor

# ─── Step 6: Restart PM2 ──────────────────────────────────────────
echo "[6/6] Restarting ${PM2_NAME} (zero-downtime)..."
cd "${APP_DIR}"
cp "${PROJECT_ROOT}/deploy/ecosystem.config.js" "${APP_DIR}/"
DAL_ENV="${DAL_ENV}" pm2 reload ecosystem.config.js \
  || DAL_ENV="${DAL_ENV}" pm2 start ecosystem.config.js
pm2 save
echo "  ✅ ${PM2_NAME} restarted"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ✅ Deploy ke ${DAL_ENV} selesai"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Verify:"
echo "  curl -s http://localhost:${BACKEND_PORT}/health | python3 -m json.tool"
echo "  pm2 logs ${PM2_NAME} --lines 30"
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
