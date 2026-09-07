#!/bin/bash
# =============================================================================
# deploy/staging-local.sh — Staging lokal, terisolasi dari development
#
#   bash deploy/staging-local.sh up       siapkan dan jalankan
#   bash deploy/staging-local.sh down     hentikan
#   bash deploy/staging-local.sh reset    hapus database + storage, lalu up
#   bash deploy/staging-local.sh status   apa yang sedang jalan
#   bash deploy/staging-local.sh logs     ikuti log backend
#
# Apa yang membuatnya terisolasi:
#
#   database  dal_db_staging          (dev memakai dal_db)
#   storage   .staging/storage        (dev memakai backend/storage)
#   log       .staging/logs           (dev memakai backend/logs)
#   backend   port 3002               (dev 3001)
#   frontend  port 4174               (dev 5173)
#
# Tidak ada satu pun berkas atau baris database dev yang tersentuh. Keduanya
# boleh jalan bersamaan.
#
# Konfigurasi diberikan lewat environment saat proses dijalankan. dotenv tidak
# menimpa variabel yang sudah ada di process.env, jadi nilai di sini menang
# atas backend/.env tanpa perlu menyalin atau mengubah berkas itu.
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="${ROOT}/.staging"
DB_NAME="dal_db_staging"
DB_CONTAINER="${DB_CONTAINER:-dal-mysql}"
BACKEND_PORT=3002
FRONTEND_PORT=4174

# IP LAN dibutuhkan supaya QR bisa dipindai dari ponsel: "localhost" pada
# ponsel menunjuk ke ponsel itu sendiri, bukan ke mesin ini.
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"
APP_URL="http://${LAN_IP}:${FRONTEND_PORT}"

DB_ROOT_PASS="$(grep -E '^DATABASE_URL=' "${ROOT}/backend/.env" | head -1 | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')"
DB_URL="mysql://root:${DB_ROOT_PASS}@127.0.0.1:3306/${DB_NAME}"

mysql_exec() { docker exec -i -e MYSQL_PWD="${DB_ROOT_PASS}" "${DB_CONTAINER}" mysql -uroot "$@"; }

say() { printf "\033[1m%s\033[0m\n" "$*"; }

# ─── Perintah ────────────────────────────────────────────────────────────────

cmd_down() {
  for name in backend frontend; do
    pidfile="${STAGE}/${name}.pid"
    if [ -f "$pidfile" ]; then
      pid="$(cat "$pidfile")"
      if kill -0 "$pid" 2>/dev/null; then
        # Vite dan nodemon membuat anak proses; bunuh seluruh grupnya.
        pkill -P "$pid" 2>/dev/null || true
        kill "$pid" 2>/dev/null || true
        echo "  ${name} dihentikan (pid ${pid})"
      fi
      rm -f "$pidfile"
    fi
  done
  # Jaring pengaman kalau pid file hilang tapi prosesnya masih memegang port.
  for port in ${BACKEND_PORT} ${FRONTEND_PORT}; do
    pid="$(lsof -ti tcp:${port} 2>/dev/null || true)"
    [ -n "$pid" ] && { kill $pid 2>/dev/null || true; echo "  port ${port} dibebaskan"; }
  done
  echo "  staging berhenti"
}

cmd_status() {
  say "Staging lokal"
  for port in "${BACKEND_PORT}:backend" "${FRONTEND_PORT}:frontend"; do
    p="${port%%:*}"; n="${port##*:}"
    if lsof -ti tcp:${p} >/dev/null 2>&1; then
      echo "  ${n} JALAN di port ${p}"
    else
      echo "  ${n} mati"
    fi
  done
  if mysql_exec -e "USE ${DB_NAME}" 2>/dev/null; then
    docs=$(mysql_exec -N -B -e "SELECT COUNT(*) FROM ${DB_NAME}.documents" 2>/dev/null || echo '?')
    users=$(mysql_exec -N -B -e "SELECT COUNT(*) FROM ${DB_NAME}.users" 2>/dev/null || echo '?')
    echo "  database ${DB_NAME}: ${users} user, ${docs} dokumen"
  else
    echo "  database ${DB_NAME}: belum ada"
  fi
  [ -d "${STAGE}/storage/documents" ] && echo "  storage: $(du -sh "${STAGE}/storage" 2>/dev/null | cut -f1)"
  echo "  APP_URL: ${APP_URL}"
}

cmd_reset() {
  say "Menghapus database dan storage staging"
  cmd_down
  mysql_exec -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`"
  rm -rf "${STAGE}/storage" "${STAGE}/logs"
  echo "  bersih"
  cmd_up
}

cmd_up() {
  say "Menyiapkan staging lokal"

  docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$" \
    || { echo "GAGAL: container MySQL '${DB_CONTAINER}' tidak jalan." >&2; exit 1; }

  mkdir -p "${STAGE}/storage"/{documents,tmp,tmp_img} "${STAGE}/storage/cache/stamped" "${STAGE}/logs"

  echo "[1/5] Database ${DB_NAME}..."
  mysql_exec -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

  echo "[2/5] Migrasi..."
  ( cd "${ROOT}/backend" && DATABASE_URL="${DB_URL}" npx prisma migrate deploy 2>&1 | grep -E "migration|Applying|already|No pending" || true )

  echo "[3/5] Seed..."
  ( cd "${ROOT}/backend" \
      && DATABASE_URL="${DB_URL}" NODE_ENV=staging node prisma/seed.js >/dev/null \
      && DATABASE_URL="${DB_URL}" NODE_ENV=staging node scripts/seed-dummy-users.js )

  echo "[4/5] Backend di port ${BACKEND_PORT}..."
  ( cd "${ROOT}/backend" && \
    DATABASE_URL="${DB_URL}" \
    PORT="${BACKEND_PORT}" \
    NODE_ENV=staging \
    STORAGE_PATH="${STAGE}/storage" \
    LOG_DIR="${STAGE}/logs" \
    LOG_LEVEL=info \
    APP_URL="${APP_URL}" \
    FRONTEND_URL="${APP_URL}" \
    GS_BINARY="${GS_BINARY:-gs}" \
    nohup node src/app.js > "${STAGE}/logs/backend.out" 2>&1 & echo $! > "${STAGE}/backend.pid" ) 2>/dev/null

  # Pid yang dicatat subshell tidak selalu pid proses yang akhirnya memegang
  # port — pembungkus npm/npx menyisipkan proses perantara. Catat ulang dari
  # port itu sendiri setelah proses melayani, supaya `down` benar-benar
  # mematikan yang tepat.
  sleep 1

  echo "[5/5] Frontend di port ${FRONTEND_PORT}..."
  ( cd "${ROOT}/frontend" && \
    VITE_DEV_PORT="${FRONTEND_PORT}" \
    VITE_DEV_HOST=0.0.0.0 \
    VITE_API_TARGET="http://127.0.0.1:${BACKEND_PORT}" \
    nohup npx vite > "${STAGE}/logs/frontend.out" 2>&1 & echo $! > "${STAGE}/frontend.pid" )

  # Tunggu backend benar-benar melayani, bukan sekadar prosesnya hidup.
  for i in $(seq 1 30); do
    curl -sf "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1 && break
    sleep 1
    [ "$i" = 30 ] && { echo "GAGAL: backend tidak merespons. Lihat ${STAGE}/logs/backend.out" >&2; tail -20 "${STAGE}/logs/backend.out"; exit 1; }
  done

  lsof -ti tcp:${BACKEND_PORT} 2>/dev/null | head -1 > "${STAGE}/backend.pid"  || true
  lsof -ti tcp:${FRONTEND_PORT} 2>/dev/null | head -1 > "${STAGE}/frontend.pid" || true

  echo ""
  say "Staging siap"
  echo "  frontend  ${APP_URL}"
  echo "  backend   http://127.0.0.1:${BACKEND_PORT}"
  echo "  database  ${DB_NAME}"
  echo "  storage   ${STAGE}/storage"
  echo ""
  echo "  Akun uji (password: Dummy@1234)"
  echo "    uploader@dummy.com    upload dokumen"
  echo "    approver@dummy.com    Level 0 — menentukan posisi QR"
  echo "    admin@dummy.com       Level 1"
  echo "    superadmin@dummy.com  Level 2 — final"
  echo ""
  echo "  QR pada label akan menunjuk ke ${APP_URL}/e/<id dokumen>"
  echo "  Pastikan ponsel berada di jaringan Wi-Fi yang sama."
  echo ""
  echo "  Log:  bash deploy/staging-local.sh logs"
  echo "  Stop: bash deploy/staging-local.sh down"
}

case "${1:-up}" in
  up)     cmd_up ;;
  down)   cmd_down ;;
  reset)  cmd_reset ;;
  status) cmd_status ;;
  logs)   tail -f "${STAGE}/logs/backend.out" ;;
  *)      echo "Pakai: $0 {up|down|reset|status|logs}" >&2; exit 1 ;;
esac
