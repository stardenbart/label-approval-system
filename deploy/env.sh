#!/bin/bash
# =============================================================================
# deploy/env.sh — Satu-satunya tempat yang menentukan "lingkungan mana ini".
#
# Di-source oleh deploy.sh, pm2.sh, nginx.sh, dan backup.sh:
#
#     source "$(dirname "$0")/env.sh" "${1:-}"
#
# Kenapa berkas ini ada: deploy.sh menerima argumen `staging` dan mencetak
# "Deploy to staging", tapi argumen itu TIDAK PERNAH dipakai untuk apa pun
# selain teks. APP_DIR selalu /var/www/dal-system dan pm2 selalu dipanggil
# dengan --env production. Artinya `bash deploy.sh staging` men-deploy ke
# PRODUKSI: menimpa berkasnya, menjalankan migrasi di database produksi, dan
# me-restart aplikasi yang sedang dipakai orang — sambil menampilkan kata
# "staging" di layar.
#
# Sekarang lingkungan menentukan SEMUANYA: folder, nama proses PM2, port,
# folder backup. Dua lingkungan bisa hidup berdampingan di satu mesin tanpa
# saling menyentuh.
# =============================================================================

DAL_ENV="${1:-}"

if [ -z "${DAL_ENV}" ]; then
  cat >&2 <<MSG
GAGAL: lingkungan wajib disebutkan.

  bash $(basename "${0}") production
  bash $(basename "${0}") staging

Tidak ada nilai bawaan — dulu bawaannya "production", sehingga salah ketik
atau lupa argumen langsung mengenai server sungguhan.
MSG
  exit 1
fi

case "${DAL_ENV}" in
  production)
    APP_DIR="/var/www/dal-system"
    PM2_NAME="dal-backend"
    BACKEND_PORT=3001
    BACKUP_DIR="${BACKUP_DIR:-/var/backups/dal}"
    DB_NAME="dal_db"
    ;;
  staging)
    APP_DIR="/var/www/dal-system-staging"
    PM2_NAME="dal-backend-staging"
    BACKEND_PORT=3101
    BACKUP_DIR="${BACKUP_DIR:-/var/backups/dal-staging}"
    DB_NAME="dal_db_staging"
    ;;
  *)
    echo "GAGAL: lingkungan '${DAL_ENV}' tidak dikenal. Pilihan: production, staging" >&2
    exit 1
    ;;
esac

ENV_FILE="${APP_DIR}/backend/.env"
STORAGE_DIR="${APP_DIR}/backend/storage/documents"

export DAL_ENV APP_DIR PM2_NAME BACKEND_PORT BACKUP_DIR DB_NAME ENV_FILE STORAGE_DIR

# Produksi tidak boleh tersentuh karena kebiasaan jari. Lewati dengan
# CONFIRM=yes untuk pemakaian non-interaktif (CI), tapi harus disengaja.
confirm_production() {
  [ "${DAL_ENV}" != "production" ] && return 0
  [ "${CONFIRM:-}" = "yes" ] && { echo "  (CONFIRM=yes — konfirmasi dilewati)"; return 0; }

  echo ""
  echo "  ╔════════════════════════════════════════════╗"
  echo "  ║  INI PRODUKSI — ${APP_DIR}"
  echo "  ║  Aplikasi yang sedang dipakai orang akan"
  echo "  ║  di-restart, dan migrasi akan dijalankan."
  echo "  ╚════════════════════════════════════════════╝"
  echo ""
  read -r -p "  Ketik 'production' untuk melanjutkan: " answer
  if [ "${answer}" != "production" ]; then
    echo "  Dibatalkan." >&2
    exit 1
  fi
}

echo "Lingkungan : ${DAL_ENV}"
echo "  folder   : ${APP_DIR}"
echo "  proses   : ${PM2_NAME} (port ${BACKEND_PORT})"
echo "  backup   : ${BACKUP_DIR}"
