#!/bin/bash
# =============================================================================
# deploy/restore-to-staging.sh — Pulihkan backup PRODUKSI ke lingkungan staging
#
#   bash deploy/restore-to-staging.sh <db.sql.gz> <storage.tar.gz>
#
# Variabel yang bisa disetel (nilai bawaan = staging lokal di mesin pengembang):
#   TARGET_DB        dal_db_staging
#   TARGET_STORAGE   <repo>/.staging/storage
#   MYSQL            "docker exec -i dal-mysql mysql -uroot"
#   SOURCE_PREFIX    /var/www/dal-system/backend/storage    (path di produksi)
#
# Kenapa skrip ini ada:
#
#   Kolom path_original, path_signed_* dan qr_path_* menyimpan path ABSOLUT.
#   Memulihkan dump produksi apa adanya menghasilkan database yang menunjuk ke
#   /var/www/... — folder yang tidak ada di mesin staging. Aplikasi tetap
#   menyala, daftar dokumen tetap tampil, dan baru saat seseorang mengunduh PDF
#   ketahuan semuanya 404.
#
#   Lebih buruk lagi: skrip penyimpanan akan menganggap SELURUH berkas hilang
#   dan melaporkan "0 bisa ditautkan, 0 bisa dikompresi" — rehearsal-nya tampak
#   lolos padahal tidak menguji apa pun.
#
# MENOLAK jalan kalau target mengandung kata "production" atau bukan database
# ber-akhiran _staging, kecuali ALLOW_UNSAFE_TARGET=yes.
# =============================================================================

set -euo pipefail

DUMP="${1:-}"
TARBALL="${2:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

TARGET_DB="${TARGET_DB:-dal_db_staging}"
TARGET_STORAGE="${TARGET_STORAGE:-${ROOT}/.staging/storage}"
MYSQL="${MYSQL:-docker exec -i dal-mysql mysql -uroot}"
SOURCE_PREFIX="${SOURCE_PREFIX:-/var/www/dal-system/backend/storage}"

if [ -z "$DUMP" ] || [ -z "$TARBALL" ]; then
  echo "Pakai: $0 <db.sql.gz> <storage.tar.gz>" >&2; exit 1
fi
for f in "$DUMP" "$TARBALL"; do
  [ -r "$f" ] || { echo "GAGAL: tidak bisa membaca $f" >&2; exit 1; }
done

# Penjaga: jangan pernah menimpa produksi dengan skrip yang namanya "staging".
if [ "${ALLOW_UNSAFE_TARGET:-}" != "yes" ]; then
  case "$TARGET_DB" in
    *production*|dal_db) echo "GAGAL: TARGET_DB='$TARGET_DB' terlihat seperti produksi. Setel ALLOW_UNSAFE_TARGET=yes bila memang disengaja." >&2; exit 1 ;;
    *_staging) ;;
    *) echo "GAGAL: TARGET_DB='$TARGET_DB' tidak berakhiran _staging." >&2; exit 1 ;;
  esac
fi

echo "Sumber   : $(basename "$DUMP") + $(basename "$TARBALL")"
echo "Tujuan   : database $TARGET_DB"
echo "           storage  $TARGET_STORAGE"
echo ""

# ─── 1. Database ─────────────────────────────────────────────────────────────
echo "[1/5] Memulihkan database..."
$MYSQL -e "DROP DATABASE IF EXISTS \`${TARGET_DB}\`;
           CREATE DATABASE \`${TARGET_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gunzip -c "$DUMP" | $MYSQL "$TARGET_DB"
echo "  $($MYSQL -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${TARGET_DB}'") tabel, $($MYSQL -N -B -e "SELECT COUNT(*) FROM ${TARGET_DB}.documents") dokumen"

# ─── 2. Berkas ───────────────────────────────────────────────────────────────
echo "[2/5] Memulihkan berkas dokumen..."
rm -rf "${TARGET_STORAGE}/documents"
mkdir -p "${TARGET_STORAGE}"/{documents,tmp,tmp_img} "${TARGET_STORAGE}/cache/stamped"
# tar mempertahankan hard link secara bawaan — jangan tambahkan -H.
tar -xzf "$TARBALL" -C "$TARGET_STORAGE"
echo "  $(find "${TARGET_STORAGE}/documents" -name '*.pdf' | wc -l | tr -d ' ') PDF dipulihkan"

# ─── 3. Tulis ulang path ─────────────────────────────────────────────────────
echo "[3/5] Menulis ulang path absolut..."
echo "  $SOURCE_PREFIX"
echo "  -> $TARGET_STORAGE"
$MYSQL "$TARGET_DB" <<SQL
UPDATE documents SET
  path_original     = REPLACE(path_original,     '${SOURCE_PREFIX}', '${TARGET_STORAGE}'),
  path_signed_level0= REPLACE(path_signed_level0,'${SOURCE_PREFIX}', '${TARGET_STORAGE}'),
  path_signed_level1= REPLACE(path_signed_level1,'${SOURCE_PREFIX}', '${TARGET_STORAGE}'),
  path_signed_final = REPLACE(path_signed_final, '${SOURCE_PREFIX}', '${TARGET_STORAGE}'),
  path_check_report = REPLACE(path_check_report, '${SOURCE_PREFIX}', '${TARGET_STORAGE}'),
  qr_path_original  = REPLACE(qr_path_original,  '${SOURCE_PREFIX}', '${TARGET_STORAGE}'),
  qr_path_esign     = REPLACE(qr_path_esign,     '${SOURCE_PREFIX}', '${TARGET_STORAGE}');
UPDATE document_approvals SET
  path_signed = REPLACE(path_signed, '${SOURCE_PREFIX}', '${TARGET_STORAGE}'),
  qr_path     = REPLACE(qr_path,     '${SOURCE_PREFIX}', '${TARGET_STORAGE}');
SQL
SISA=$($MYSQL -N -B "$TARGET_DB" -e "SELECT COUNT(*) FROM documents WHERE path_original LIKE '${SOURCE_PREFIX}%'")
echo "  baris yang masih menunjuk produksi: ${SISA}"
[ "$SISA" = "0" ] || { echo "  GAGAL: masih ada path produksi" >&2; exit 1; }

# ─── 4. Migrasi ──────────────────────────────────────────────────────────────
# Dump produksi memakai skema versi lama; kolom baru belum ada di sana.
echo "[4/5] Menjalankan migrasi..."
( cd "${ROOT}/backend" && DATABASE_URL="${STAGING_DATABASE_URL:-mysql://root:yourpassword@127.0.0.1:3306/${TARGET_DB}}" \
    npx prisma migrate deploy 2>&1 | grep -E "Applying|already|No pending|migration" | sed 's/^/  /' )

# ─── 5. Bukti: setiap path yang dirujuk database benar-benar ada ─────────────
echo "[5/5] Memverifikasi setiap berkas yang dirujuk database..."
MISSING=$($MYSQL -N -B "$TARGET_DB" -e "
  SELECT path_original FROM documents WHERE path_original IS NOT NULL
  UNION ALL SELECT path_signed_level0 FROM documents WHERE path_signed_level0 IS NOT NULL
  UNION ALL SELECT path_signed_level1 FROM documents WHERE path_signed_level1 IS NOT NULL
  UNION ALL SELECT path_signed_final  FROM documents WHERE path_signed_final  IS NOT NULL
  UNION ALL SELECT qr_path_original   FROM documents WHERE qr_path_original   IS NOT NULL
" | while read -r p; do [ -f "$p" ] || echo "$p"; done | wc -l | tr -d ' ')
echo "  berkas dirujuk tapi tidak ada: ${MISSING}"

echo ""
if [ "$MISSING" = "0" ]; then
  echo "Selesai. Staging kini berisi salinan data produksi."
else
  echo "Selesai DENGAN CATATAN: ${MISSING} berkas dirujuk database tapi tidak ada di disk."
  echo "Itu bisa berarti backup berkas dan dump database diambil pada waktu berbeda."
fi
echo "Jalankan: cd backend && npm run storage:doctor"
