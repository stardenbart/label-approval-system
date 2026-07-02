# DAL System — Digital Approval Label

Sistem manajemen persetujuan label produk berbasis web.  
**Stack:** React 18 + Vite · Express.js · MySQL 8 · Prisma · PM2 · Nginx

---

## Struktur Project

```
dal-system/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma     ← Database schema (MySQL)
│   │   └── seed.js           ← Initial data seeder
│   ├── src/
│   │   ├── app.js            ← Entry point
│   │   ├── config/           ← logger, prisma client
│   │   ├── controllers/      ← Route handlers
│   │   ├── middleware/        ← auth, roleCheck, upload, rateLimiter, errorHandler
│   │   ├── routes/           ← Express routers
│   │   └── services/         ← pdf, qr, email, audit, notification, id-generator, label-check-report
│   ├── storage/              ← Uploaded files (NOT in git)
│   │   └── documents/{uuid}/ ← Per-document storage
│   │       ├── original.pdf
│   │       ├── signed_level1.pdf
│   │       ├── signed_final.pdf
│   │       ├── qr_original.png
│   │       ├── qr_esign.png
│   │       ├── label_check_report.pdf
│   │       └── remarks/      ← NG remarks images
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/       ← AppLayout, PublicLayout
│   │   │   ├── ESignCanvas/  ← PDF.js drag-drop QR stamp
│   │   │   └── NotificationBell/
│   │   ├── pages/            ← All page components
│   │   ├── services/api.js   ← Axios + token refresh interceptor
│   │   ├── store/authStore.js← Zustand auth state
│   │   ├── App.jsx           ← Routes + guards
│   │   └── main.jsx
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
└── deploy/
    ├── setup.sh              ← Initial server setup (run once)
    ├── nginx.sh              ← Nginx config
    ├── pm2.sh                ← PM2 start
    ├── firewall.sh           ← UFW firewall rules
    ├── deploy.sh             ← Build + deploy (run every release)
    └── ecosystem.config.js   ← PM2 process config
```

---

## Quick Start (Development)

### 1. Setup Database

```bash
# Install MySQL 8 jika belum ada
# Create database
mysql -u root -e "CREATE DATABASE dal_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -e "CREATE USER 'dal_user'@'127.0.0.1' IDENTIFIED BY 'your_password';"
mysql -u root -e "GRANT ALL ON dal_db.* TO 'dal_user'@'127.0.0.1'; FLUSH PRIVILEGES;"
```

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env — isi DATABASE_URL, JWT secrets, SMTP, APP_URL

npm install
npx prisma migrate dev --name init
node prisma/seed.js
npm run dev
```

Backend berjalan di: `http://localhost:3001`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend berjalan di: `http://localhost:5173`

### 4. Login Pertama

```
Email:    superadmin@dal.internal
Password: Admin@DAL2026!
```
> Wajib ganti password setelah login pertama.

---

## Production Deployment (Ubuntu 22.04)

### Langkah 1 — Setup server (sekali saja)

```bash
# Di server
sudo bash deploy/setup.sh
```

### Langkah 2 — Konfigurasi .env

```bash
sudo cp /var/www/dal-system/backend/.env.example /var/www/dal-system/backend/.env
sudo nano /var/www/dal-system/backend/.env

# Wajib diisi:
# DATABASE_URL="mysql://dal_user:PASSWORD@127.0.0.1:3306/dal_db"
# JWT_ACCESS_SECRET=<64-char random string>
# JWT_REFRESH_SECRET=<64-char random string>
# APP_URL=https://dal.yourdomain.com
# FRONTEND_URL=https://dal.yourdomain.com
# SMTP_USER=your.gmail@gmail.com
# SMTP_PASS=your_gmail_app_password
```

### Langkah 3 — Deploy pertama kali

```bash
# Di local machine (atau server)
bash deploy/deploy.sh production

# Inisialisasi DB
cd /var/www/dal-system/backend
node prisma/seed.js

# Setup Nginx
sudo bash deploy/nginx.sh dal.yourdomain.com

# Setup Firewall
sudo bash deploy/firewall.sh

# Setup PM2
sudo bash deploy/pm2.sh
```

### Langkah 4 — HTTPS (opsional tapi recommended)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d dal.yourdomain.com
```

### Deploy Selanjutnya (update kode)

```bash
bash deploy/deploy.sh production
```

---

## Roles & Akses

| Role        | Upload | Approve | View All | User Mgmt | Settings |
|-------------|--------|---------|----------|-----------|----------|
| superadmin  | ✅     | ✅      | ✅       | ✅        | ✅       |
| admin       | ❌     | ✅      | ✅       | ❌        | ❌       |
| approver    | ❌     | ✅      | Terbatas | ❌        | ❌       |
| viewer      | ❌     | ❌      | Approved | ❌        | ❌       |

---

## API Endpoints (ringkasan)

| Method | Endpoint                          | Role         | Deskripsi               |
|--------|-----------------------------------|--------------|-------------------------|
| POST   | /api/auth/login                   | Public       | Login                   |
| POST   | /api/auth/refresh                 | Public       | Refresh access token    |
| POST   | /api/auth/logout                  | Auth         | Logout                  |
| GET    | /api/documents                    | Auth         | List dokumen            |
| POST   | /api/documents                    | superadmin   | Upload dokumen          |
| GET    | /api/documents/:id                | Auth         | Detail dokumen          |
| POST   | /api/approvals/:id/approve        | Auth         | Approve dokumen         |
| POST   | /api/approvals/:id/decline        | Auth         | Decline dokumen         |
| GET    | /api/notifications                | Auth         | List notifikasi         |
| GET    | /api/settings                     | Auth         | System settings         |
| GET    | /api/e/:uuid                      | Public       | QR E-Sign public page   |
| GET    | /api/documents/:id/original       | Auth         | Download PDF original   |
| GET    | /api/documents/:id/signed         | Auth         | Download PDF signed     |
| GET    | /api/documents/:id/qr/esign       | Auth         | Download QR E-Sign      |

---

## Generate JWT Secrets

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Jalankan 2x untuk ACCESS dan REFRESH secret yang berbeda.

---

## Troubleshooting

```bash
# Cek backend
pm2 logs dal-backend --lines 50
curl http://localhost:3001/health

# Cek nginx
sudo nginx -t
sudo tail -f /var/log/nginx/dal-error.log

# Cek database
mysql -u dal_user -p dal_db -e "SHOW TABLES;"

# Restart semua
pm2 reload dal-backend
sudo systemctl reload nginx
```
