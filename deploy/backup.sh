#!/bin/bash
# =============================================================================
# deploy/backup.sh — Backup DAL: database + berkas dokumen
#
#   sudo bash deploy/backup.sh production
#   sudo bash deploy/backup.sh staging --db-only
#   APP_DIR=/path BACKUP_DIR=/mnt/nas/dal bash deploy/backup.sh   # manual/dev
#
# WAJIB dijalankan sebelum:
#   - npx prisma migrate deploy
#   - npm run storage:dedupe   -- --apply
#   - npm run storage:manifest -- --verify --prune
#   - npm run storage:compress -- --apply
#
# Tiga yang terakhir mengubah berkas secara PERMANEN. Dump database saja tidak
# akan menyelamatkan PDF-mu.
#
# Dua hal yang membuat backup ini berbeda dari `tar` biasa:
#
#   -H pada tar          Dokumen dengan isi identik berbagi satu inode lewat
#                        hard link (lihat storage-dedup.service.js). Tanpa -H,
#                        tar menulis tiap link sebagai salinan penuh: arsipnya
#                        membengkak, dan saat dipulihkan semua tautan hilang
#                        sehingga penghematannya tidak pernah kembali.
#
#   --single-transaction Dump diambil dari satu snapshot konsisten tanpa
#                        mengunci tabel, jadi aplikasi tetap melayani permintaan
#                        selama backup berjalan.
# =============================================================================

set -euo pipefail

# Lingkungan menentukan folder aplikasi, folder backup, dan berkas .env mana
# yang dibaca. Nilai apa pun yang sudah ada di environment tetap menang, supaya
# skrip ini bisa dipakai di mesin dev untuk menguji.
if [ -z "${APP_DIR:-}" ]; then
  # shellcheck source=env.sh
  source "$(dirname "$0")/env.sh" "${1:-}"
  shift || true
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/dal}"
STORAGE_DIR="${STORAGE_DIR:-${APP_DIR}/backend/storage/documents}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/backend/.env}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_ONLY=false
[ "${1:-}" = "--db-only" ] && DB_ONLY=true

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "${BACKUP_DIR}"

# ─── Kredensial database dari .env ───────────────────────────────────────────
# DATABASE_URL="mysql://user:pass@host:port/dbname"
if [ ! -f "${ENV_FILE}" ]; then
  echo "GAGAL: ${ENV_FILE} tidak ada. Setel ENV_FILE ke lokasi yang benar." >&2
  exit 1
fi
DB_URL="$(grep -E '^DATABASE_URL=' "${ENV_FILE}" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [ -z "${DB_URL}" ]; then
  echo "GAGAL: DATABASE_URL tidak ditemukan di ${ENV_FILE}" >&2
  exit 1
fi
proto_removed="${DB_URL#mysql://}"
creds="${proto_removed%%@*}"
hostpart="${proto_removed#*@}"
DB_USER="${creds%%:*}"
DB_PASS="${creds#*:}"
DB_HOST="${hostpart%%:*}"
rest="${hostpart#*:}"
DB_PORT="${rest%%/*}"
DB_NAME="${rest#*/}"
DB_NAME="${DB_NAME%%\?*}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   DAL — Backup ${STAMP}        ║"
echo "╚══════════════════════════════════════════╝"
echo "  tujuan   : ${BACKUP_DIR}"
echo "  database : ${DB_NAME} @ ${DB_HOST}:${DB_PORT}"
echo ""

# ─── 1. Database ─────────────────────────────────────────────────────────────
DB_FILE="${BACKUP_DIR}/dal_db_${STAMP}.sql.gz"
echo "[1/3] Dump database..."
MYSQL_PWD="${DB_PASS}" mysqldump \
  -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" \
  --single-transaction --routines --triggers --events \
  --default-character-set=utf8mb4 \
  "${DB_NAME}" | gzip > "${DB_FILE}"

# Dump yang terpotong tetap menghasilkan berkas .gz yang tampak wajar. Baris
# penutup mysqldump adalah satu-satunya bukti murah bahwa isinya lengkap.
if ! gunzip -c "${DB_FILE}" | tail -5 | grep -q "Dump completed"; then
  echo "  GAGAL: dump tidak lengkap — tidak ada baris 'Dump completed'" >&2
  rm -f "${DB_FILE}"
  exit 1
fi
TABLES=$(gunzip -c "${DB_FILE}" | grep -c "^CREATE TABLE" || true)
echo "  OK — $(du -h "${DB_FILE}" | cut -f1), ${TABLES} tabel"

# ─── 2. Berkas dokumen ───────────────────────────────────────────────────────
if [ "${DB_ONLY}" = false ]; then
  echo "[2/3] Arsip berkas dokumen..."
  if [ ! -d "${STORAGE_DIR}" ]; then
    echo "  GAGAL: ${STORAGE_DIR} tidak ada" >&2
    exit 1
  fi
  FILES_FILE="${BACKUP_DIR}/dal_storage_${STAMP}.tar.gz"

  # -H mempertahankan hard link. Cache sengaja tidak ikut: isinya bisa dibuat
  # ulang dan hanya membuat arsipnya besar tanpa guna.
  tar -czHf "${FILES_FILE}" \
      --exclude='cache' \
      -C "$(dirname "${STORAGE_DIR}")" "$(basename "${STORAGE_DIR}")"

  LINKS=$(tar -tvzf "${FILES_FILE}" | grep -c "^h" || true)
  echo "  OK — $(du -h "${FILES_FILE}" | cut -f1), ${LINKS} hard link dipertahankan"
else
  echo "[2/3] Berkas dilewati (--db-only)"
fi

# ─── 3. Retensi ──────────────────────────────────────────────────────────────
echo "[3/3] Membuang backup lebih tua dari ${RETENTION_DAYS} hari..."
DELETED=$(find "${BACKUP_DIR}" -maxdepth 1 -name 'dal_*' -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
echo "  ${DELETED} berkas dibuang"

chmod 600 "${BACKUP_DIR}"/dal_* 2>/dev/null || true

echo ""
echo "Selesai. Isi ${BACKUP_DIR}:"
ls -lh "${BACKUP_DIR}" | tail -6
echo ""
echo "Uji pulih (WAJIB sekali-sekali — backup yang tidak pernah diuji bukan backup):"
echo "  gunzip -c ${DB_FILE} | mysql -u root -p dal_db_uji"
echo "  tar -tzf ${BACKUP_DIR}/dal_storage_${STAMP}.tar.gz | head"
