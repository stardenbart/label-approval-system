#!/bin/bash
# =============================================================================
# deploy/setup.sh
# DAL System — Full Ubuntu Server Setup Script
# Tested on Ubuntu 22.04 LTS
# Run as root: sudo bash setup.sh
# =============================================================================

set -euo pipefail

# ─── Config — Edit before running ────────────────────────────────────────────
APP_DIR="/var/www/dal-system"
DB_NAME="dal_db"
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

# ─── 4. Nginx ─────────────────────────────────────────────────────────────────
echo "[4/10] Installing Nginx..."
apt-get install -y nginx
systemctl start nginx
systemctl enable nginx

# ─── 5. App directory ─────────────────────────────────────────────────────────
echo "[5/10] Setting up application directories..."
mkdir -p ${APP_DIR}/{backend,frontend}
mkdir -p ${APP_DIR}/backend/storage/{documents,tmp,tmp_img}
mkdir -p ${APP_DIR}/backend/logs
mkdir -p /var/log/dal

# Create dal system user
if ! id "dalapp" &>/dev/null; then
  useradd -r -s /bin/false -d ${APP_DIR} dalapp
fi
chown -R dalapp:www-data ${APP_DIR}
chmod -R 750 ${APP_DIR}
chmod -R 770 ${APP_DIR}/backend/storage
chmod -R 770 ${APP_DIR}/backend/logs
chmod -R 770 /var/log/dal

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
echo "  4. Configure Nginx (run: sudo bash deploy/nginx.sh)"
echo "  5. Configure PM2 (run: sudo bash deploy/pm2.sh)"
echo "  6. Configure Firewall (run: sudo bash deploy/firewall.sh)"
echo ""
echo "DB_NAME: ${DB_NAME}"
echo "DB_USER: ${DB_USER}"
echo "DB_PASS: ${DB_PASS}"
echo "APP_DIR: ${APP_DIR}"
echo ""
