#!/bin/bash
# =============================================================================
# deploy/setup.sh
# DAL System — Full Ubuntu Server Setup Script
# Tested on Ubuntu 22.04 LTS
# Run as root: sudo bash setup.sh <production|staging>
# =============================================================================

set -euo pipefail

# ─── Config — Edit before running ────────────────────────────────────────────
# APP_DIR, DB_NAME, dan port datang dari env.sh supaya satu mesin bisa
# menampung produksi dan staging berdampingan tanpa saling menimpa.
# shellcheck source=env.sh
source "$(dirname "$0")/env.sh" "${1:-}"
DB_USER="dal_user"
DB_PASS="CHANGE_THIS_STRONG_DB_PASSWORD"
DOMAIN="dal.yourdomain.com"        # or server IP for internal use
NODE_VERSION="20"
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   DAL System — Ubuntu Server Setup       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── 1. System update ─────────────────────────────────────────────────────────
echo "[1/10] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget git unzip build-essential ufw

# ─── 2. Node.js ───────────────────────────────────────────────────────────────
echo "[2/10] Installing Node.js $NODE_VERSION..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi
echo "  Node: $(node -v) | npm: $(npm -v)"

# PM2
npm install -g pm2 --quiet

# ─── 3. MySQL 8 ───────────────────────────────────────────────────────────────
echo "[3/10] Installing MySQL 8..."
if ! command -v mysql &>/dev/null; then
  apt-get install -y mysql-server
  systemctl start mysql
  systemctl enable mysql
fi

# Create database and user
mysql -u root <<EOF
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
EOF
echo "  MySQL database '${DB_NAME}' and user '${DB_USER}' created"

# ─── 3b. Ghostscript ──────────────────────────────────────────────────────────
# Dipakai untuk mengompresi berkas arsip PDF: ~58% lebih kecil tanpa menurunkan
# resolusi gambar. Opsional — kalau tidak ada, kompresi dilewati dengan
# peringatan dan tidak ada alur kerja yang berhenti. Dipasang di sini supaya
# tidak diam-diam terlewat.
echo "[3b/10] Installing Ghostscript..."
apt-get install -y -qq ghostscript
echo "  Ghostscript: $(gs --version)"

# ─── 4. Nginx ─────────────────────────────────────────────────────────────────
echo "[4/10] Installing Nginx..."
apt-get install -y nginx
systemctl start nginx
systemctl enable nginx

# ─── 5. App directory ─────────────────────────────────────────────────────────
echo "[5/10] Setting up application directories..."
mkdir -p ${APP_DIR}/{backend,frontend}
# tmp dan documents WAJIB satu filesystem — dedup memakai hard link, dan lintas
# partisi ia jatuh ke salinan penuh tanpa satu pun error. Karena itu keduanya
# dibuat di bawah satu induk yang sama, jangan dipisah ke mount berbeda.
mkdir -p ${APP_DIR}/backend/storage/{documents,tmp,tmp_img}
mkdir -p ${APP_DIR}/backend/storage/cache/stamped
mkdir -p ${APP_DIR}/backend/logs
mkdir -p /var/log/dal
mkdir -p ${BACKUP_DIR}

# Create dal system user
if ! id "dalapp" &>/dev/null; then
  useradd -r -s /bin/false -d ${APP_DIR} dalapp
fi
chown -R dalapp:www-data ${APP_DIR}
chmod -R 750 ${APP_DIR}
chmod -R 770 ${APP_DIR}/backend/storage
chmod -R 770 ${APP_DIR}/backend/logs
chmod -R 770 /var/log/dal
chown -R dalapp:www-data ${BACKUP_DIR}
chmod 700 ${BACKUP_DIR}            # backup berisi hash password dan token

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  MANUAL STEPS REQUIRED (see below)       ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""
echo "  1. Copy your project files:"
echo "     rsync -av ./backend/ ${APP_DIR}/backend/"
echo "     rsync -av ./frontend/dist/ ${APP_DIR}/frontend/"
echo ""
echo "  2. Configure backend .env:"
echo "     cp ${APP_DIR}/backend/.env.example ${APP_DIR}/backend/.env"
echo "     nano ${APP_DIR}/backend/.env"
echo "     # Set DATABASE_URL, JWT secrets, SMTP, APP_URL etc."
echo ""
echo "  3. Run database migration:"
echo "     cd ${APP_DIR}/backend && npm install --production"
echo "     npx prisma migrate deploy"
echo "     node prisma/seed.js"
echo ""
echo "  4. Periksa kesiapan penyimpanan:"
echo "     cd ${APP_DIR}/backend && npm run storage:doctor"
echo ""
echo "  5. Pasang backup harian ke cron:"
echo "     echo '0 1 * * * root bash ${APP_DIR}/deploy/backup.sh ${DAL_ENV} >> /var/log/dal/backup.log 2>&1' > /etc/cron.d/dal-backup"
echo ""
echo "  6. Configure Nginx (run: sudo bash deploy/nginx.sh ${DAL_ENV} <domain>)"
echo "  7. Configure PM2 (run: sudo bash deploy/pm2.sh ${DAL_ENV})"
echo "  8. Configure Firewall (run: sudo bash deploy/firewall.sh)"
echo ""
echo "DB_NAME: ${DB_NAME}"
echo "DB_USER: ${DB_USER}"
echo "DB_PASS: ${DB_PASS}"
echo "APP_DIR: ${APP_DIR}"
echo ""
