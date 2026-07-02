# Product Requirements Document
# Digital Approval Label System (DAL)

**Versi:** 1.2  
**Tanggal:** 12 Juni 2026  
**Lokasi Meeting:** RNI Office  
**Status:** Draft — Pending Final Sign-off  
**Penulis:** [Senior Fullstack Developer + IT QA]

**Changelog v1.1 → v1.2:**
- [CLOSE] OI-07: E-Sign visual stamp → drag-and-drop QR positioning dengan global default configurable
- [ADD] Tabel `system_settings`, `document_esign_positions`
- [ADD] Tabel `label_check_parameters`, `label_check_forms`, `label_check_results`, `label_check_remarks`
- [UPDATE] Sprint Plan: Split Sprint 1 menjadi 1A (2 minggu) dan 1B (s/d 1 bulan) untuk akomodasi drag-and-drop
- [ADD] FR-10: E-Sign Drag-and-Drop Positioning
- [ADD] FR-11: Global E-Sign System Settings
- [ADD] FR-12: Label Design Checking Form + Report Generation (Scope 2–3 Bulan)
- [ADD] OI-08: Siapa yang mengisi Label Design Checking Form dan kapan (perlu konfirmasi)
- [ADD] OI-09: "Gambar bagian yang diremarks" — upload manual atau anotasi on-PDF (perlu konfirmasi)
- [UPDATE] Acceptance Criteria

---

## Daftar Isi

1. [Executive Summary](#1-executive-summary)
2. [Konteks & Latar Belakang](#2-konteks--latar-belakang)
3. [Scope & Out-of-Scope](#3-scope--out-of-scope)
4. [Asumsi & Ketergantungan](#4-asumsi--ketergantungan)
5. [Klarifikasi & Resolusi Ambiguitas](#5-klarifikasi--resolusi-ambiguitas)
6. [Arsitektur Sistem](#6-arsitektur-sistem)
7. [Data Model](#7-data-model)
8. [User Roles & Permission Matrix](#8-user-roles--permission-matrix)
9. [Fitur & Functional Requirements](#9-fitur--functional-requirements)
10. [Workflow Approval](#10-workflow-approval)
11. [Security Requirements](#11-security-requirements)
12. [Non-Functional Requirements](#12-non-functional-requirements)
13. [Sprint Plan](#13-sprint-plan)
14. [Open Issues Remaining](#14-open-issues-remaining)
15. [Acceptance Criteria](#15-acceptance-criteria)

---

## 1. Executive Summary

**Digital Approval Label (DAL)** adalah aplikasi web internal untuk mengelola siklus hidup dokumen Design Label Regulatory — mulai dari upload dan sign oleh Staff RnI, proses e-sign multi-level (SPV RnI dan Tim Marketing), hingga distribusi dokumen final ter-approve beserta laporan hasil pengecekan label.

Sistem menghasilkan dua jenis QR Code per dokumen:
- **QR Code E-Sign:** Dapat discan siapa saja tanpa login. Menampilkan halaman tabular: identitas dokumen, riwayat signing (nama approver, role, timestamp), dan status approval sesuai QR Code sign approver mana yang discan.
- **QR Code Original Document:** Memerlukan login. Menampilkan file PDF versi sebelum di-sign.

Setiap approver dapat menempatkan QR Code E-Sign mereka secara presisi di posisi tanda tangan pada dokumen melalui antarmuka drag-and-drop. Ukuran default QR Code dapat dikonfigurasi secara global oleh Admin.

**Business value utama:**
- Traceability digital penuh dengan audit trail terstruktur
- Fleksibilitas penempatan tanda tangan (drag-and-drop) sesuai tata letak dokumen
- Laporan hasil pengecekan label otomatis (scope penuh 2–3 bulan)
- Dokumen confidential terlindungi — akses file hanya via sistem berautentikasi
- Alur komunikasi dan approval yang terstruktur
- Menghindari terjadinya penyalahgunaan tanda tangan yang dimiliki orang masing-masing

---

## 2. Konteks & Latar Belakang

| Item | Detail |
|---|---|
| **Inisiator** | Staff RnI — RNI Office |
| **Tipe Dokumen** | Design Label Regulatory (PDF) |
| **Sifat Dokumen** | Rahasia / Confidential |
| **Target Delivery (Sprint)** | 1 bulan — Core MVP + E-Sign drag-and-drop + full approval workflow|
| **Target Delivery (Full System)** | 2–3 bulan — Seluruh fitur termasuk Label Design Checking |

---

## 3. Scope & Out-of-Scope

### 3.1 In-Scope — Sprint (`1 Bulan)

- Auth sistem (login/logout, JWT, role-based access) — **prerequisite mutlak**
- Upload PDF + input metadata oleh Staff RnI
- Auto-generate ID Regulatory
- Generate QR Code Original Document + QR Code E-Sign per user tiap kali approval
- Halaman E-Sign publik (tanpa login) — tabular view identitas + riwayat signing
- Akses PDF original via QR Code Original (butuh login)
- E-Sign stamp ditempatkan di posisi sesuai keinginan user dengan fitur drag-and-drop
- Global default QR size memiliki settingan dengan 3 ukuran yang dapat dipilih user 
- 3 ukuran E-Sign (Large, Medium (Default), dan Small) sesuai yang telah di setup pada settings oleh admin
- Halaman list dokumen + detail dokumen basic

### 3.2 In-Scope — Sprint 1B (s/d 1 Bulan)

- Drag-and-drop QR stamp positioning saat approval (interactive PDF preview)
- System Settings page: konfigurasi global default QR size dan posisi default
- Approval workflow 3-level (SPV RnI → Tim Marketing) dengan email notifikasi via SMTP Gmail
- Dynamic approver assignment saat approve (dropdown searchable)
- PDF e-sign overlay server-side menggunakan koordinat dari drag-and-drop
- Web notification system (bell + badge + dropdown)
- Notifikasi Forgot Password ke Superadmin
- Home page dengan filter + search + pagination dan KPI Card status dokumen
- Download dokumen (original & signed final) sesuai role
- Design website responsive menyesuaikan dengan tampilan yang digunakan oleh user

### 3.3 In-Scope — Full System (2–3 Bulan)

- CRUD User Management + product-approver mapping
- CRUD Product Category
- Change Password & Forgot Password full flow
- Delete dokumen sesuai role
- Audit Log Viewer (Superadmin)
- **Label Design Checking Form** — input parameter pengecekan, OK/NG per poin, remarks + lampiran gambar
- **Auto-generate PDF Laporan Pengecekan** — 3 halaman: hasil pengecekan, tabel remarks, lampiran design label
- Reassign approver oleh Superadmin
- Alur decline dokumen beserta list revisi yang menyertakan remarks serta gambar terkait (opsional melampirkan gambar)

### 3.4 Out-of-Scope

- Integrasi sistem eksternal (SAP, SharePoint, dll.)
- Mobile app native
- PKI-based legally binding digital signature (UU ITE)
- Re-submit pada dokumen Declined (dokumen baru diajukan terpisah)
- Anotasi langsung on-PDF untuk remarks (diasumsikan upload gambar manual — lihat OI-09)

---

## 4. Asumsi & Ketergantungan

| # | Asumsi |
|---|---|
| A1 | Server on-premise tersedia dengan SSH dan MySQL |
| A2 | Gmail SMTP App Password sudah disiapkan |
| A3 | Dokumen PDF yang diupload sudah final dari sisi konten |
| A4 | Jumlah dokumen ≤ 500 per tahun (tahun pertama) |
| A5 | Semua user akses dari jaringan internal atau VPN |
| A6 | SPV RnI adalah satu entitas approver level 1 |
| A7 | Tim Marketing: 5 orang approver, masing-masing per kategori produk |
| A8 | tanggal_terima dan tanggal_periksa diisi manual oleh Staff RnI saat upload |
| A9 | QR Code E-Sign dirancang untuk dapat discan oleh pihak eksternal tanpa akun |
| A10 | "Gambar bagian yang diremarks" pada Label Checking adalah file gambar yang diupload manual oleh user (screenshot/foto/crop) — bukan anotasi on-PDF langsung (pending konfirmasi OI-09) |
| A11 | Koordinat posisi QR stamp disimpan sebagai persentase terhadap dimensi halaman PDF (bukan pixel absolut) agar resolution-independent |

---

## 5. Klarifikasi & Resolusi Ambiguitas

### 5.1 Format ID Regulatory ✅ RESOLVED

Format: `[PRODCODE]-[DDMMYY_terima]-[DDMMYY_periksa]-[4RAND]`

```
Contoh: CYD01-110626-120626-A3F2
```

- Di-generate sistem saat dokumen tersimpan, immutable
- Collision handling: retry max 5x pada random 4-char

---

### 5.2 E-Sign: Visual Verification System ✅ RESOLVED

E-Sign adalah **visual traceability system** (bukan PKI/legally binding). Halaman QR E-Sign publik menampilkan:

| Field | |
|---|---|
| Identitas dokumen | ID Regulatory, Nama Label, Nama File, Kategori |
| Tanggal-tanggal | Terima, Periksa, Verifikasi, Approval |
| Riwayat Signing | Per level: nama user, jabatan/role, timestamp |
| Status | PENDING / APPROVED / DECLINED |

> Halaman ini dapat menampilkan status dokumen yang belum fully approved (status PENDING dengan riwayat partial). Ini acceptable — QR Code dapat dibagikan kapan saja, scanner melihat status real-time.

---

### 5.3 Approval Workflow: 3 Tingkat ✅ RESOLVED

| Tingkat | Aktor | Aksi |
|---|---|---|
| 0 | Staff RnI | Upload & Sign + Input Metadata (initiator) |
| 1 | SPV RnI | Approve / Decline + Assign ke Marketing |
| 2 | Tim Marketing | Approve / Decline (final) |

Tim Marketing 5 orang, masing-masing mapped ke product group. Konfigurasi di User Management oleh Superadmin.

---

### 5.4 Dynamic Approver Assignment — Hybrid Model ✅ RESOLVED

- Superadmin set pool + product-approver mapping (global)
- SPV saat approve: pilih specific Marketing member dari dropdown searchable (pool Level 2), auto-suggest berdasarkan kategori produk dokumen
- Level final (Marketing): field "Assign to" tidak muncul
- Superadmin dapat reassign jika approver tidak tersedia

---

### 5.5 QR Code Access Control ✅ RESOLVED

| QR Code | Akses | Tampilan |
|---|---|---|
| **QR Code E-Sign** | Publik, tanpa login | Halaman tabular: identitas + riwayat signing + status |
| **QR Code Original Document** | Butuh login | PDF versi pre-sign. Redirect ke login jika belum authenticated |

Signed version hanya dapat diakses dan didownload via halaman dokumen (login required, sesuai role).

---

### 5.6 PDF Versioning ✅ RESOLVED

```
/storage/documents/{doc_uuid}/
  ├── original.pdf            ← immutable, upload pertama
  ├── signed_level0.pdf       ← sign dari staff RnI
  ├── signed_level1.pdf       ← setelah SPV approve
  └── signed_final.pdf        ← setelah Marketing approve (final)
```

---

### 5.7 E-Sign Drag-and-Drop Positioning ✅ RESOLVED (OI-07 ditutup)

**Konsep:** Saat approver akan melakukan tanda tangan (approve), tampil antarmuka PDF preview interaktif. Approver dapat drag QR Code stamp ke posisi yang diinginkan pada halaman PDF manapun sebelum submit approval.

**Default global (sebelum user drag):**
- Ukuran default: `100pt × 100pt` (sekitar 3.5cm × 3.5cm pada dokumen A4)
- Posisi default: pojok kiri bawah, halaman pertama, margin 20pt dari tepi
- Dapat dikonfigurasi Superadmin via halaman System Settings

**Mekanisme teknis:**
- PDF di-render di browser menggunakan **PDF.js**
- Overlay layer React di atas PDF canvas: menampilkan QR Code stamp yang bisa di-drag
- Koordinat disimpan sebagai **persentase** terhadap lebar/tinggi halaman (bukan pixel) — resolution-independent
- Approver juga dapat mengubah ukuran QR stamp (resize handle) dalam rentang: min `60pt × 60pt`, max `200pt × 200pt`
- Saat submit approval: koordinat dikirim ke backend, pdf-lib menempatkan QR pada koordinat yang tepat

**Catatan koordinat sistem:**
- Browser: origin top-left, satuan pixel
- PDF (pdf-lib): origin bottom-left, satuan points (1 pt = 1/72 inch)
- Konversi wajib dilakukan di backend berdasarkan dimensi halaman PDF aktual

**Implementasi bertahap:**
- Sprint hinggu full system: Drag-and-drop interaktif + resize + System Settings page aktif.

---

## 6. Arsitektur Sistem

### 6.1 Tech Stack (Lengkap)

| Layer | Teknologi |
|---|---|
| **Frontend** | React 18 (JSX), Vite, Tailwind CSS |
| **Backend** | Node.js 20 LTS + Express.js |
| **Database** | MySQL 8.x |
| **ORM** | Prisma |
| **Auth** | JWT — Access Token (15 mnt) + Refresh Token (7 hari, httpOnly Cookie) |
| **File Storage** | Local filesystem terstruktur — tidak pernah di `public/` |
| **PDF Processing** | pdf-lib — overlay e-sign stamp + QR Code di koordinat yang ditentukan |
| **PDF Preview (Frontend)** | PDF.js (`pdfjs-dist`) — render PDF di browser untuk drag-and-drop |
| **QR Code** | `qrcode` (Node.js) — generate server-side |
| **Email** | Nodemailer + Gmail SMTP |
| **Notifikasi** | Polling 30 detik (atau SSE jika infrastruktur mendukung) |
| **PDF Report Generation** | pdf-lib — generate laporan pengecekan label (Sprint 3) |
| **Security** | Helmet.js, express-rate-limit, CORS strict, bcrypt (cost 12), joi |

### 6.2 Struktur Direktori

```
dal-system/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/        # auth, role-check, upload, rate-limit
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── pdf.service.js        # overlay, versioning, coordinate convert
│   │   │   ├── qr.service.js         # QR Code generation
│   │   │   ├── email.service.js
│   │   │   ├── notification.service.js
│   │   │   ├── id-generator.service.js
│   │   │   └── label-check-report.service.js  # Sprint 3
│   │   └── app.js
│   ├── storage/
│   │   └── documents/
│   │       └── {doc_uuid}/
│   │           ├── original.pdf
│   │           ├── signed_level1.pdf
│   │           ├── signed_final.pdf
│   │           ├── qr_original.png
│   │           ├── qr_esign.png
│   │           └── label_check_report.pdf    # Sprint 3
│   └── prisma/
│       ├── schema.prisma
│       └── seed.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ESignCanvas/        # PDF.js + drag-and-drop overlay
│   │   │   ├── NotificationBell/
│   │   │   └── ...
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── utils/
│   └── vite.config.js
└── .env.example
```

### 6.3 Prinsip Keamanan Arsitektur

1. File PDF tidak pernah menjadi static asset — semua akses via endpoint authenticated
2. QR Code Original: URL ke `GET /api/documents/{uuid}/original` — butuh JWT
3. QR Code E-Sign: URL ke `GET /e/{uuid}` — halaman React publik, data dari endpoint publik yang hanya return metadata (tidak ada path file)
4. Nama file di disk: UUID murni
5. Koordinat drag-and-drop divalidasi di backend sebelum digunakan di pdf-lib (range check: 0–100% per axis)

---

## 7. Data Model

### 7.1 Tabel `users`

```sql
users
├── id                UUID PRIMARY KEY
├── name              VARCHAR(100) NOT NULL
├── email             VARCHAR(150) UNIQUE NOT NULL
├── password_hash     VARCHAR(255) NOT NULL
├── role              ENUM('superadmin','admin','approver','viewer') NOT NULL
├── is_active         BOOLEAN DEFAULT TRUE
├── must_change_pwd   BOOLEAN DEFAULT FALSE
├── created_at        DATETIME DEFAULT NOW()
├── updated_at        DATETIME ON UPDATE NOW()
└── deleted_at        DATETIME NULL
```

### 7.2 Tabel `product_groups`

```sql
product_groups
├── id          INT AUTO_INCREMENT PRIMARY KEY
├── name        VARCHAR(100) NOT NULL
├── code        VARCHAR(10) UNIQUE NOT NULL
└── is_active   BOOLEAN DEFAULT TRUE
```

### 7.3 Tabel `product_categories`

```sql
product_categories
├── id              INT AUTO_INCREMENT PRIMARY KEY
├── group_id        INT FK → product_groups.id ON DELETE RESTRICT
├── name            VARCHAR(150) NOT NULL
├── sub_group       VARCHAR(100) NULL
├── product_code    CHAR(5) NOT NULL
└── is_active       BOOLEAN DEFAULT TRUE
```

### 7.4 Tabel `product_approver_mappings`

```sql
product_approver_mappings
├── id                  INT AUTO_INCREMENT PRIMARY KEY
├── product_group_id    INT FK → product_groups.id
├── approver_user_id    UUID FK → users.id
├── level               TINYINT NOT NULL DEFAULT 2
└── created_at          DATETIME DEFAULT NOW()

UNIQUE KEY uq_group_level (product_group_id, level)
```

### 7.5 Tabel `documents`

```sql
documents
├── id                    UUID PRIMARY KEY
├── regulatory_id         VARCHAR(40) UNIQUE NOT NULL
├── product_category_id   INT FK → product_categories.id ON DELETE RESTRICT
├── label_name            VARCHAR(200) NOT NULL
├── file_name_original    VARCHAR(255) NOT NULL
├── path_original         VARCHAR(500) NOT NULL
├── path_signed_level0    VARCHAR(500) NULL
├── path_signed_level1    VARCHAR(500) NULL
├── path_signed_final     VARCHAR(500) NULL
├── path_check_report     VARCHAR(500) NULL        -- Sprint 3: path laporan pengecekan
├── status                ENUM('PENDING_APPROVAL','APPROVED','DECLINED') DEFAULT 'PENDING_APPROVAL'
├── uploaded_by           UUID FK → users.id
├── tanggal_terima        DATE NOT NULL
├── tanggal_periksa       DATE NOT NULL
├── tanggal_verifikasi    DATE NULL
├── tanggal_approval      DATE NULL
├── qr_path_original      VARCHAR(500) NULL
├── qr_path_esign         VARCHAR(500) NULL
├── created_at            DATETIME DEFAULT NOW()
├── updated_at            DATETIME ON UPDATE NOW()
└── deleted_at            DATETIME NULL
```

### 7.6 Tabel `document_approvals`

```sql
document_approvals
├── id                UUID PRIMARY KEY
├── document_id       UUID FK → documents.id
├── approver_id       UUID FK → users.id
├── assigned_by       UUID FK → users.id NULL
├── level             TINYINT NOT NULL            -- 1 = SPV, 2 = Marketing
├── status            ENUM('PENDING','APPROVED','DECLINED') DEFAULT 'PENDING'
├── next_approver_id  UUID FK → users.id NULL
├── path_signed       VARCHAR(500) NULL           -- PDF versi setelah level ini sign
├── qr_path           VARCHAR(500) NULL
├── notes             TEXT NULL
├── signed_at         DATETIME NULL
└── created_at        DATETIME DEFAULT NOW()
```

### 7.7 Tabel `document_esign_positions` *(New — v1.2)*

```sql
document_esign_positions
├── id                UUID PRIMARY KEY
├── document_id       UUID FK → documents.id
├── approval_id       UUID FK → document_approvals.id
├── page_number       INT NOT NULL DEFAULT 1       -- halaman PDF (1-based)
├── x_percent         DECIMAL(6,3) NOT NULL        -- posisi X sebagai % lebar halaman (0.000–100.000)
├── y_percent         DECIMAL(6,3) NOT NULL        -- posisi Y sebagai % tinggi halaman (0.000–100.000)
├── width_pt          DECIMAL(7,2) NOT NULL        -- lebar QR dalam PDF points
├── height_pt         DECIMAL(7,2) NOT NULL        -- tinggi QR dalam PDF points
└── created_at        DATETIME DEFAULT NOW()

-- Constraint: satu approval hanya punya satu posisi
UNIQUE KEY uq_approval_position (approval_id)
```

> **QA Note:** Koordinat persentase digunakan (bukan pixel absolut) agar posisi akurat di berbagai ukuran halaman PDF (A4, A3, Letter, dll.). Backend wajib konversi persen → pt saat proses pdf-lib menggunakan dimensi halaman aktual dari file PDF yang di-proses.

### 7.8 Tabel `system_settings` *(New — v1.2)*

```sql
system_settings
├── key         VARCHAR(100) PRIMARY KEY
├── value       TEXT NOT NULL
├── description VARCHAR(255) NULL       -- deskripsi untuk admin
└── updated_at  DATETIME ON UPDATE NOW()
```

**Seed data default system_settings:**

| Key | Default Value | Description |
|---|---|---|
| `qr_default_width_pt` | `100` | Lebar default QR stamp (PDF points) |
| `qr_default_height_pt` | `100` | Tinggi default QR stamp (PDF points) |
| `qr_default_page` | `1` | Halaman default penempatan QR stamp |
| `qr_default_x_percent` | `85` | Posisi X default (% lebar halaman) |
| `qr_default_y_percent` | `5` | Posisi Y default (% tinggi halaman, dari bawah untuk PDF) |
| `qr_min_width_pt` | `60` | Minimum ukuran QR (points) |
| `qr_max_width_pt` | `200` | Maksimum ukuran QR (points) |

### 7.9 Tabel `notifications`

```sql
notifications
├── id            UUID PRIMARY KEY
├── user_id       UUID FK → users.id
├── type          ENUM(
│                   'APPROVAL_ASSIGNED',
│                   'APPROVAL_DONE',
│                   'APPROVAL_DECLINED',
│                   'FORGOT_PASSWORD',
│                   'SYSTEM'
│                 ) NOT NULL
├── title         VARCHAR(200) NOT NULL
├── message       TEXT NOT NULL
├── entity_type   VARCHAR(50) NULL
├── entity_id     VARCHAR(100) NULL
├── is_read       BOOLEAN DEFAULT FALSE
└── created_at    DATETIME DEFAULT NOW()

INDEX idx_user_unread (user_id, is_read, created_at DESC)
```

### 7.10 Tabel `audit_logs`

```sql
audit_logs
├── id          UUID PRIMARY KEY
├── user_id     UUID FK → users.id NULL
├── action      VARCHAR(100) NOT NULL
├── entity      VARCHAR(50) NULL
├── entity_id   VARCHAR(100) NULL
├── ip_address  VARCHAR(45) NULL
├── meta        JSON NULL
└── created_at  DATETIME DEFAULT NOW()
```

### 7.11 Tabel `refresh_tokens`

```sql
refresh_tokens
├── id          UUID PRIMARY KEY
├── user_id     UUID FK → users.id ON DELETE CASCADE
├── token_hash  VARCHAR(255) NOT NULL
├── expires_at  DATETIME NOT NULL
├── revoked     BOOLEAN DEFAULT FALSE
└── created_at  DATETIME DEFAULT NOW()
```

### 7.12 Tabel `label_check_parameters` *(New — v1.2, Sprint 3)*

```sql
label_check_parameters
├── id          INT AUTO_INCREMENT PRIMARY KEY
├── name        VARCHAR(200) NOT NULL        -- e.g., "Nama Produk", "Komposisi", "Netto"
├── description TEXT NULL                   -- penjelasan parameter ini
├── is_required BOOLEAN DEFAULT TRUE         -- apakah wajib diisi saat checking
├── order_index INT NOT NULL DEFAULT 0       -- urutan tampil di form
├── is_active   BOOLEAN DEFAULT TRUE
└── created_at  DATETIME DEFAULT NOW()
```

### 7.13 Tabel `label_check_forms` *(New — v1.2, Sprint 3)*

```sql
label_check_forms
├── id              UUID PRIMARY KEY
├── document_id     UUID FK → documents.id UNIQUE  -- satu dokumen satu form
├── checked_by      UUID FK → users.id             -- siapa yang mengisi form
├── overall_status  ENUM('OK','NOT_OK') NULL        -- diisi sistem: OK jika semua param OK
├── submitted_at    DATETIME NULL
└── created_at      DATETIME DEFAULT NOW()
```

### 7.14 Tabel `label_check_results` *(New — v1.2, Sprint 3)*

```sql
label_check_results
├── id              UUID PRIMARY KEY
├── form_id         UUID FK → label_check_forms.id
├── parameter_id    INT FK → label_check_parameters.id
├── status          ENUM('OK','NG') NOT NULL         -- OK = sesuai, NG = tidak sesuai
└── created_at      DATETIME DEFAULT NOW()

UNIQUE KEY uq_form_parameter (form_id, parameter_id)
```

### 7.15 Tabel `label_check_remarks` *(New — v1.2, Sprint 3)*

```sql
label_check_remarks
├── id              UUID PRIMARY KEY
├── result_id       UUID FK → label_check_results.id  -- hanya untuk result dengan status NG
├── description     TEXT NOT NULL                      -- keterangan remarks
├── remarks_text    TEXT NOT NULL                      -- isi remarks/catatan perbaikan
├── image_path      VARCHAR(500) NOT NULL              -- path gambar bagian yang diremarks
├── image_filename  VARCHAR(255) NOT NULL              -- nama file asli gambar
└── created_at      DATETIME DEFAULT NOW()
```

---

## 8. User Roles & Permission Matrix

> **Penamaan final:** "Viewer" lama → **Approver** (bisa e-sign). "User" lama → **Viewer** (read-only).

| Fitur / Aksi | Superadmin | Admin | Approver | Viewer |
|---|:---:|:---:|:---:|:---:|
| Upload dokumen + input metadata | ✅ | ❌ | ❌ | ❌ |
| Review & E-sign dokumen (assigned) | ✅ | ✅ | ✅ | ❌ |
| Drag-and-drop QR stamp positioning | ✅ | ✅ | ✅ | ❌ |
| Decline dokumen (assigned) | ✅ | ✅ | ✅ | ❌ |
| Assign next approver saat approve | ✅ | ✅ | ✅ | ❌ |
| Isi Label Design Checking Form | ✅ | ❌ | ❌ | ❌ |
| Lihat dokumen APPROVED | ✅ | ✅ | ✅ | ✅ |
| Lihat dokumen PENDING (assigned ke mereka) | ✅ | ✅ | ✅ hanya milik sendiri | ❌ |
| Download dokumen original | ✅ | ✅ | ✅ | ✅ |
| Download dokumen signed final | ✅ | ✅ | ✅ | ✅ |
| Download laporan pengecekan (Sprint 3) | ✅ | ✅ | ✅ | ✅ |
| Delete dokumen | ✅ | ✅ | ❌ | ❌ |
| CRUD User Management | ✅ | ❌ | ❌ | ❌ |
| Setup product-approver mapping | ✅ | ❌ | ❌ | ❌ |
| Reassign approver | ✅ | ❌ | ❌ | ❌ |
| CRUD Product Category | ✅ | ✅ | ❌ | ❌ |
| CRUD Label Check Parameters | ✅ | ✅ | ❌ | ❌ |
| System Settings (QR default size) | ✅ | ❌ | ❌ | ❌ |
| Lihat Audit Log | ✅ | ❌ | ❌ | ❌ |
| Reset password user lain | ✅ | ❌ | ❌ | ❌ |
| Terima notif Forgot Password | ✅ | ❌ | ❌ | ❌ |
| Terima notif approval assigned/done | ✅ | ✅ | ✅ | ❌ |
| Ubah password sendiri | ✅ | ✅ | ✅ | ✅ |
| Akses QR E-Sign | **Publik (tanpa login)** | | | |
| Akses QR Original Document | ✅ | ✅ | ✅ | ✅ |

---

## 9. Fitur & Functional Requirements

### FR-01: Autentikasi

| ID | Requirement |
|---|---|
| FR-01.1 | Login email + password |
| FR-01.2 | bcrypt hash, cost factor 12 |
| FR-01.3 | JWT: Access Token 15 mnt + Refresh Token 7 hari (httpOnly Cookie) |
| FR-01.4 | Logout: revoke Refresh Token di DB |
| FR-01.5 | 5x gagal login / 15 mnt / IP + account lock 30 mnt |
| FR-01.6 | `must_change_pwd = true` → wajib ganti password sebelum akses fitur lain |
| FR-01.7 | Forgot Password: notifikasi ke Superadmin (web + email). Superadmin reset via User Management |

---

### FR-02: Manajemen Dokumen

| ID | Requirement |
|---|---|
| FR-02.1 | Upload PDF, max 10MB per file |
| FR-02.2 | Validasi MIME type backend: hanya `application/pdf` |
| FR-02.3 | File disimpan dengan nama UUID, nama asli di `file_name_original` |
| FR-02.4 | Auto-generate ID Regulatory: `[PRODCODE]-[DDMMYY_terima]-[DDMMYY_periksa]-[4RAND]` |
| FR-02.5 | Collision handling 4-char: retry max 5x |
| FR-02.6 | Dokumen baru langsung buat record `document_approvals` Level 1 (SPV) |

---

### FR-03: QR Code Generation

| ID | Requirement |
|---|---|
| FR-03.1 | Dua QR Code di-generate server-side setelah dokumen tersimpan |
| FR-03.2 | **QR Code Original:** URL `https://[domain]/api/documents/{uuid}/original` (butuh JWT) |
| FR-03.3 | **QR Code E-Sign:** URL `https://[domain]/e/{uuid}` (publik, tanpa login) |
| FR-03.4 | Halaman `/e/{uuid}` menampilkan tabel: identitas dokumen + riwayat signing (nama, role, timestamp per level) + status. **Tidak ada tombol download file** |
| FR-03.5 | QR Code E-Sign mencerminkan status real-time — termasuk dokumen yang masih PENDING |
| FR-03.6 | QR Code dapat didownload sebagai PNG dari halaman detail dokumen |
| FR-03.7 | Akses `/e/{uuid}` dicatat di audit_logs (`QR_ESIGN_ACCESSED`) dengan IP + timestamp |

---

### FR-04: Approval Workflow

| ID | Requirement |
|---|---|
| FR-04.1 | Auto-assign Level 1 ke SPV RnI setelah upload |
| FR-04.2 | Approver terima email + notifikasi web saat giliran |
| FR-04.3 | Preview PDF di dalam aplikasi sebelum keputusan |
| FR-04.4 | **Approve (bukan level final):** Wajib isi "Assign Approval To:" (dropdown searchable pool Level berikutnya, auto-suggest dari mapping) |
| FR-04.5 | **Approve (level final — Marketing):** Field "Assign to" tidak ditampilkan |
| FR-04.6 | **Decline:** Komentar wajib. Status → DECLINED. Email + notif ke uploader |
| FR-04.7 | Saat approve: backend ambil posisi dari `document_esign_positions` (atau gunakan global default jika tidak ada), overlay QR stamp ke PDF, simpan versi baru |
| FR-04.8 | Semua level approved: status → APPROVED, `tanggal_approval` diisi sistem |
| FR-04.9 | Superadmin dapat reassign approver pada dokumen PENDING |

---

### FR-05: Home Page & Daftar Dokumen

| ID | Requirement |
|---|---|
| FR-05.1 | Daftar dokumen default: semua dokumen sesuai visibilitas role |
| FR-05.2 | Pagination: 10 per halaman |
| FR-05.3 | Filter: Group Product, Sub Group, Status, Tanggal (Terima/Periksa/Verifikasi/Approval) range |
| FR-05.4 | Search: Nama Label, Nama File, ID Regulatory |
| FR-05.5 | Kolom: ID Regulatory, Nama Label, Kategori, Status (badge), Tanggal Terima, Tanggal Approval, Aksi |
| FR-05.6 | Badge: PENDING = kuning, APPROVED = hijau, DECLINED = merah |
| FR-05.7 | Halaman **"Menunggu Approval Saya"**: hanya dokumen assigned ke user login |

---

### FR-06: Download Dokumen

| ID | Requirement |
|---|---|
| FR-06.1 | Download PDF original: semua role login |
| FR-06.2 | Download PDF signed final: tersedia jika status APPROVED |
| FR-06.3 | Header response: `Content-Disposition: attachment; filename="[nama_asli]"` |
| FR-06.4 | Semua download dicatat di audit_logs |

---

### FR-07: User Management (Superadmin)

| ID | Requirement |
|---|---|
| FR-07.1 | CRUD user (soft delete — tidak ada hard delete) |
| FR-07.2 | Assign role saat create/edit |
| FR-07.3 | Setup product-approver mapping: assign user Marketing ke product group |
| FR-07.4 | Deactivate user yang sedang menjadi pending approver → alert Superadmin untuk reassign |
| FR-07.5 | Reset password: set temporary pwd, email ke user, set `must_change_pwd = true` |

---

### FR-08: Product Category Management

| ID | Requirement |
|---|---|
| FR-08.1 | CRUD Product Group dan Product Category oleh Superadmin + Admin |
| FR-08.2 | Category/Group yang terhubung dokumen: tidak dapat dihapus, hanya deactivate |
| FR-08.3 | Seed data awal sesuai daftar §9.1 |

---

### FR-09: Web Notification System

| ID | Requirement |
|---|---|
| FR-09.1 | Bell icon + badge count di navbar |
| FR-09.2 | Dropdown: max 20 notifikasi terbaru, item unread visual berbeda (bold/highlight) |
| FR-09.3 | Item notifikasi: icon type, judul, pesan singkat, timestamp relatif |
| FR-09.4 | Klik notif → navigasi ke halaman relevan + mark as read |
| FR-09.5 | "Mark all as read" di header dropdown |
| FR-09.6 | Polling setiap 30 detik untuk badge count update |
| FR-09.7 | **Superadmin:** `FORGOT_PASSWORD` notif + tombol "Reset Password User Ini" langsung dari item notifikasi |
| FR-09.8 | Approver: `APPROVAL_ASSIGNED`. Uploader: `APPROVAL_DONE`, `APPROVAL_DECLINED` |
| FR-09.9 | Cleanup notifikasi > 30 hari via cron job |

---

### FR-10: E-Sign Drag-and-Drop Positioning *(New — v1.2, aktif Sprint 1B)*

| ID | Requirement |
|---|---|
| FR-10.1 | Saat approver klik "Approve", tampil halaman approval dengan dua panel: (kiri) PDF preview interaktif, (kanan) form approval (notes, assign to) |
| FR-10.2 | PDF di-render via PDF.js. Approver dapat navigasi ke halaman manapun untuk menempatkan stamp |
| FR-10.3 | QR stamp ditampilkan sebagai overlay draggable di atas PDF canvas. Default posisi mengikuti `system_settings` |
| FR-10.4 | Approver dapat drag stamp ke posisi manapun pada halaman yang dipilih |
| FR-10.5 | Approver dapat resize stamp menggunakan resize handle di sudut. Batasan: min `qr_min_width_pt`, max `qr_max_width_pt` dari system_settings |
| FR-10.6 | Tombol "Reset to Default" untuk mengembalikan posisi ke global default |
| FR-10.7 | Saat submit: frontend kirim `{ page_number, x_percent, y_percent, width_pt, height_pt }` ke backend |
| FR-10.8 | Backend validasi range koordinat (0–100% untuk x/y, min–max untuk size) sebelum proses |
| FR-10.9 | Backend konversi x_percent/y_percent → pt menggunakan dimensi halaman aktual dari PDF (diambil via pdf-lib sebelum overlay) |
| FR-10.10 | Sprint 1A fallback: stamp ditempatkan di posisi global default jika drag-and-drop belum aktif |

---

### FR-11: Global E-Sign System Settings *(New — v1.2, aktif Sprint 1B)*

| ID | Requirement |
|---|---|
| FR-11.1 | Halaman System Settings hanya dapat diakses Superadmin |
| FR-11.2 | Form pengaturan: Default QR Width (pt), Default QR Height (pt), Default Page, Default Position X (%), Default Position Y (%) |
| FR-11.3 | Preview visual: tampilkan representasi posisi QR stamp pada template halaman A4 |
| FR-11.4 | Perubahan settings disimpan ke tabel `system_settings`, berlaku untuk semua approval baru (tidak retroaktif ke dokumen yang sudah approved) |
| FR-11.5 | Tombol "Reset to Factory Default" untuk mengembalikan ke nilai awal |

---

### FR-12: Label Design Checking Form + Report Generation *(New — v1.2, Sprint 3 — 2–3 Bulan)*

> **⚠️ OI-08 & OI-09 belum resolved — lihat §14. Requirement di bawah berdasarkan asumsi terbaik saat ini dan wajib divalidasi sebelum Sprint 3 dimulai.**

| ID | Requirement |
|---|---|
| FR-12.1 | Staff RnI dapat membuka **Form Pengecekan Label Design** dari halaman detail dokumen yang sudah diupload |
| FR-12.2 | Form menampilkan daftar `label_check_parameters` (configurable oleh Admin/Superadmin) |
| FR-12.3 | Setiap parameter memiliki pilihan **OK** atau **NG** (Not Good) |
| FR-12.4 | Jika satu atau lebih parameter NG: user wajib mengisi remarks untuk setiap parameter NG tersebut |
| FR-12.5 | Per remarks: wajib isi (1) deskripsi singkat masalah, (2) teks remarks/catatan perbaikan yang diperlukan, (3) upload gambar bagian label yang bermasalah (JPG/PNG, max 5MB per gambar) |
| FR-12.6 | Form dapat disimpan sebagai draft (belum submit) |
| FR-12.7 | Setelah form di-submit: sistem auto-generate **PDF Laporan Pengecekan** yang terdiri dari 3 bagian |
| FR-12.8 | **Bagian 1 — Hasil Pengecekan:** Header dokumen (ID Regulatory, nama produk, tanggal checking), tabel parameter (nama parameter, status OK/NG), ringkasan (total OK, total NG, overall status), nama checker + timestamp |
| FR-12.9 | **Bagian 2 — Tabel Remarks:** Tabel berisi kolom: No, Poin Parameter, Deskripsi Masalah, Remarks/Catatan Perbaikan, Gambar (thumbnail gambar yang diupload). Hanya muncul jika ada NG |
| FR-12.10 | **Bagian 3 — Lampiran Design Label:** Halaman-halaman dari PDF original yang diupload oleh Staff RnI (PDF di-merge/append ke laporan) |
| FR-12.11 | PDF Laporan disimpan di `path_check_report` di tabel documents. Dapat didownload dari halaman detail dokumen |
| FR-12.12 | CRUD Label Check Parameters: Superadmin + Admin dapat menambah, mengedit, nonaktifkan parameter |
| FR-12.13 | Laporan Pengecekan dapat di-regenerate jika ada perubahan pada form sebelum dokumen masuk approval workflow |

---

### 9.1 Seed Data Product Category

| Group | Category Name | Sub Group |
|---|---|---|
| CYD | CYD 240ml | Regular |
| CYD | CYD 240ml | No Added Sugar |
| CYD | CYD 65ml | — |
| CYD | CYD UHT 200ml | — |
| CYD | CYD UHT 125ml | — |
| ESL | ESL 950ml | — |
| UHT Milk | UHT Milk 250ml | — |
| UHT Milk | UHT Milk 225ml | — |
| UHT Milk | UHT Milk 125ml | — |
| Yoghurt | Yoghurt Squeeze | Regular |
| Yoghurt | Yoghurt Squeeze | Bites |
| Stickpack | Stickpack | 30gr |
| Stickpack | Stickpack | 40gr |
| Others | Eat Milk | — |
| Others | Frutas | — |

---

## 10. Workflow Approval

### 10.1 Diagram Lengkap

```
[START]
   │
   ▼
[Staff RnI] Login
   ├── Input metadata + upload PDF
   │   (Opsional Sprint 3: isi Form Pengecekan Label dahulu → generate laporan)
   │
   ▼
Sistem:
   ├── Validasi PDF + ukuran
   ├── Simpan → /storage/{uuid}/original.pdf
   ├── Generate ID Regulatory
   ├── Generate QR Code Original + QR Code E-Sign (PNG)
   ├── Buat document_approvals Level 1 (SPV)
   ├── Kirim notifikasi web + email → SPV RnI
   └── Status: PENDING_APPROVAL
   │
   ▼
[SPV RnI] — Notifikasi masuk (bell + email)
   │
   ├── Login → "Menunggu Approval Saya"
   ├── Buka dokumen → Preview PDF
   │
   ├─[DECLINE]──→ Isi komentar wajib
   │              Status → DECLINED
   │              Notif + email → Staff RnI
   │              ────── END ──────
   │
   └─[APPROVE]──→ Halaman Approval:
                  ┌─────────────────────────────────────────────┐
                  │ Panel Kiri: PDF Preview (PDF.js)            │
                  │   - Drag QR stamp ke posisi tanda tangan    │
                  │   - Resize jika perlu                       │
                  │   - Navigasi multi-page jika PDF panjang    │
                  │                                             │
                  │ Panel Kanan: Form Approval                  │
                  │   - Notes (opsional)                        │
                  │   - [Assign Approval To:] ← WAJIB          │
                  │     Dropdown searchable → pool Marketing    │
                  │     Auto-suggest berdasarkan product mapping│
                  └─────────────────────────────────────────────┘
                  Submit →
                  Sistem:
                  ├── Simpan posisi ke document_esign_positions
                  ├── Overlay QR stamp di koordinat tsb → signed_level1.pdf
                  ├── Buat document_approvals Level 2 (Marketing yg dipilih)
                  ├── Kirim notifikasi web + email → Marketing member
                  └── Status: PENDING_APPROVAL (masih)
                   │
                   ▼
                [Tim Marketing] — Notifikasi masuk
                   │
                   ├── Login → "Menunggu Approval Saya"
                   ├── Preview PDF (signed_level1)
                   │
                   ├─[DECLINE]──→ Komentar wajib
                   │              Status → DECLINED
                   │              Notif + email → Staff RnI
                   │              ──── END ────
                   │
                   └─[APPROVE]──→ Halaman Approval (sama: drag QR stamp)
                                  (Field "Assign to" TIDAK MUNCUL — level final)
                                  Submit →
                                  Sistem:
                                  ├── Overlay QR stamp → signed_final.pdf
                                  ├── Status → APPROVED
                                  ├── tanggal_approval = TODAY
                                  └── Notif + email → Staff RnI: "Fully Approved"
                                   │
                                   ▼
                                 [FINISH]
```

### 10.2 State Machine Dokumen

```
[PENDING_APPROVAL] ──[any level DECLINED]──→ [DECLINED]  (terminal)
[PENDING_APPROVAL] ──[all levels APPROVED]──→ [APPROVED] (terminal)
```

---

## 11. Security Requirements

### 11.1 Autentikasi & Otorisasi
- Semua endpoint (kecuali `/auth/login`, `/auth/refresh`, `/e/{uuid}`) butuh JWT valid
- Role-check di middleware terpisah setelah auth middleware
- Endpoint file: double check JWT valid + user punya akses ke dokumen tersebut

### 11.2 File Security
- `/storage/` di luar `public/` — tidak dapat diakses via URL langsung
- Nama file di disk: UUID murni
- Header serve file: `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment`
- Gambar remarks (Sprint 3): disimpan di `/storage/documents/{uuid}/remarks/`, akses via endpoint authenticated

### 11.3 Input Validation
- Semua input validasi backend dengan `joi`
- Semua query via Prisma ORM (no raw SQL concat)
- Koordinat drag-and-drop: validasi range (x/y: 0–100, size: min–max) di backend sebelum pdf-lib
- Upload file: validasi MIME type dari bytes, bukan ekstensi

### 11.4 Transport Security
- HTTPS wajib, HTTP redirect ke HTTPS
- JWT di httpOnly Cookie: `httpOnly`, `secure`, `sameSite: strict`
- CORS: strict whitelist origin frontend

### 11.5 Security Headers (Helmet.js)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy` ketat
- `Strict-Transport-Security: max-age=31536000`

### 11.6 Rate Limiting
- Login: 5x / 15 mnt / IP
- Upload: 10 req / mnt / user
- Halaman publik QR E-Sign: 60 req / mnt / IP
- API umum: 100 req / mnt / user

### 11.7 Audit Trail (Non-negotiable)

| Action | Trigger |
|---|---|
| `LOGIN_SUCCESS / LOGIN_FAILED` | Auth |
| `DOCUMENT_UPLOADED` | Upload |
| `DOCUMENT_APPROVED / DECLINED` | Per level |
| `DOCUMENT_DOWNLOADED` | Download file |
| `DOCUMENT_DELETED` | Delete |
| `QR_ESIGN_ACCESSED` | Halaman publik E-Sign |
| `QR_ORIGINAL_ACCESSED` | Endpoint original (login) |
| `USER_CREATED / DEACTIVATED` | User mgmt |
| `PASSWORD_RESET` | Superadmin reset |
| `LABEL_CHECK_SUBMITTED` | Sprint 3 |

---

## 12. Non-Functional Requirements

| Kategori | Requirement |
|---|---|
| **Performance** | List 500 dokumen < 2 dtk. Upload 10MB < 5 dtk. PDF preview load < 3 dtk. PDF overlay signing < 10 dtk |
| **Availability** | 99% uptime jam kerja 07:00–17:00 WIB |
| **Scalability** | Mampu 1.000 dokumen tanpa perubahan arsitektur |
| **Browser Support** | Chrome latest, Firefox latest, Edge latest |
| **Maintainability** | MVC konsisten. README setup lokal + prod. `.env.example` terdokumentasi |
| **Error Handling** | JSON konsisten `{ success, message, code }`. Tidak ada stack trace ke client |
| **Logging** | winston/morgan. Log file di-rotate harian |
| **Backup** | Prosedur backup DB harian + storage mingguan terdokumentasi |

---

## 13. Sprint Plan

### Sprint 1A — Core MVP (Target: 2 Minggu)

**Deliverable:** Upload + QR generation + E-Sign publik + akses original via login berfungsi. E-sign stamp di posisi global default (belum drag-and-drop).

| # | Task | Priority |
|---|---|---|
| 1 | Project setup: Vite+React, Express, MySQL, Prisma, folder structure | Must |
| 2 | DB migration: users, product_groups, product_categories, documents, system_settings | Must |
| 3 | Auth: login, JWT, refresh token, middleware, rate limit, account lock | Must |
| 4 | Seed: product categories, default system_settings, 1 Superadmin account | Must |
| 5 | Upload endpoint: validasi MIME+ukuran, simpan ke storage, rename UUID | Must |
| 6 | Auto-generate ID Regulatory (collision handling) | Must |
| 7 | Generate QR Code Original + E-Sign (server-side PNG) | Must |
| 8 | Serve PDF original via endpoint authenticated | Must |
| 9 | Halaman publik `/e/{uuid}`: tabular identitas dokumen + riwayat signing + status | Must |
| 10 | Halaman Upload (React form) | Must |
| 11 | Halaman List Dokumen (tabel basic, pagination) | Must |
| 12 | Halaman Detail Dokumen (metadata + 2 QR Code + download QR) | Must |
| 13 | E-sign stamp placeholder: generate signed PDF dengan stamp di posisi global default hardcoded | Must |

> **⚠️ QA Gate Sprint 1A:** Tidak boleh deploy tanpa auth berfungsi penuh. File PDF tidak boleh bisa diakses tanpa JWT valid. Halaman E-Sign publik tidak boleh mengekspos path file atau endpoint file apapun.

---

### Sprint 1B — Full MVP dengan Drag-and-Drop (Target: s/d 1 Bulan)

**Deliverable:** Approval workflow aktif + drag-and-drop QR positioning + notification system + System Settings.

| # | Task | Priority |
|---|---|---|
| 1 | DB migration: document_approvals, document_esign_positions, notifications, refresh_tokens, product_approver_mappings | Must |
| 2 | Approval workflow: endpoint Approve + Decline | Must |
| 3 | PDF.js integration di frontend untuk PDF preview | Must |
| 4 | Drag-and-drop QR stamp overlay (React draggable + resizable component) | Must |
| 5 | Koordinat x/y percent frontend → backend endpoint | Must |
| 6 | Backend: konversi persen → pt + pdf-lib overlay di koordinat yang diterima | Must |
| 7 | Sprint 1A: ganti hardcoded stamp → gunakan system_settings default jika tidak ada posisi custom | Must |
| 8 | System Settings page (Superadmin): form QR default + preview posisi di template A4 | Must |
| 9 | Dropdown "Assign Approval To:" + auto-suggest dari product_approver_mappings | Must |
| 10 | Email notifikasi: Nodemailer + Gmail SMTP (assigned, approved, declined) | Must |
| 11 | Web notification system: bell icon, badge, dropdown, polling 30s, mark as read | Must |
| 12 | Notifikasi Forgot Password untuk Superadmin + tombol reset langsung dari notif | Must |
| 13 | Halaman "Menunggu Approval Saya" | Must |
| 14 | Home page filter (Group, Sub Group, Status, Tanggal range) + search + pagination | Must |
| 15 | Download dokumen original + signed final sesuai role | Must |

> **⚠️ Implementation Risk — Drag-and-Drop:** PDF.js coordinate → PDF points conversion adalah area rawan bug. Wajib testing dengan berbagai ukuran PDF (A4, A3, landscape, portrait) dan berbagai zoom level browser sebelum Sprint 1B dianggap selesai. QA harus verifikasi posisi stamp di PDF output akurat dengan toleransi ±2pt dari posisi yang dipilih user.

---

### Sprint 2 — Supporting Features (Target: Bulan ke-2)

| # | Task | Priority |
|---|---|---|
| 1 | CRUD User Management + product-approver mapping setup | Must |
| 2 | Reassign approver oleh Superadmin | Must |
| 3 | CRUD Product Category | Must |
| 4 | Change Password (semua role) | Must |
| 5 | Forgot Password full flow (notif Superadmin → reset → temporary pwd via email) | Must |
| 6 | Delete dokumen sesuai role (soft delete) | Must |
| 7 | Audit Log Viewer (Superadmin) | Should |
| 8 | UI/UX polish: responsive, loading states, error states, empty states | Should |
| 9 | Unit test: service layer (ID generator, coordinate conversion, PDF overlay, QR gen) | Must |
| 10 | Integration test: endpoint kritis (auth, upload, approve, decline, serve file) | Must |
| 11 | Production deployment guide + `.env.example` lengkap | Must |
| 12 | Cron job: cleanup notifikasi > 30 hari | Should |

---

### Sprint 3 — Label Design Checking (Target: Bulan ke-2 s/d ke-3)

> **Prerequisite:** OI-08 dan OI-09 harus resolved sebelum Sprint 3 dimulai.

| # | Task | Priority |
|---|---|---|
| 1 | DB migration: label_check_parameters, label_check_forms, label_check_results, label_check_remarks | Must |
| 2 | CRUD Label Check Parameters (Superadmin + Admin) | Must |
| 3 | Seed parameter default (list parameter pengecekan label — perlu input dari stakeholder) | Must |
| 4 | Form Pengecekan Label Design: per-parameter OK/NG input | Must |
| 5 | Upload gambar remarks (validasi type: JPG/PNG, max 5MB) | Must |
| 6 | Service generate PDF Laporan Pengecekan (pdf-lib): 3 bagian (hasil, tabel remarks + gambar, lampiran PDF original) | Must |
| 7 | Simpan laporan ke storage, update `path_check_report` di documents | Must |
| 8 | Download laporan dari halaman detail dokumen | Must |
| 9 | Re-generate laporan jika form diubah sebelum approval | Should |
| 10 | Testing: generate laporan dengan berbagai kombinasi (semua OK, mix NG, semua NG) | Must |

---

## 14. Open Issues Remaining

| # | Issue | Status | Keterangan |
|---|---|---|---|
| OI-01 | Legal validity e-sign | ✅ CLOSED | Visual traceability only |
| OI-02 | Format ID Regulatory | ✅ CLOSED | `[CODE]-[DDMMYY_terima]-[DDMMYY_periksa]-[4RAND]` |
| OI-03 | Jumlah level approval | ✅ CLOSED | 3 tingkat: Staff → SPV → Marketing |
| OI-04 | QR Code access control | ✅ CLOSED | E-Sign publik, Original butuh login |
| OI-05 | Versioning PDF intermediate | ✅ CLOSED | Semua versi disimpan |
| OI-06 | Siapa yang assign approver | ✅ CLOSED | Hybrid: global pool + dynamic per-step |
| OI-07 | E-Sign stamp visual design | ✅ CLOSED | Drag-and-drop + resize + System Settings |
| **OI-08** | **Siapa yang isi Label Design Checking Form dan kapan?** | 🔴 **OPEN** | Asumsi saat ini: Staff RnI saat upload, sebelum masuk approval. Tapi apakah SPV/Marketing juga bisa isi atau revisi form ini? Langsung mempengaruhi FR-12 dan permission matrix. **Wajib resolved sebelum Sprint 3 dimulai** |
| **OI-09** | **"Gambar bagian yang diremarks" — upload manual atau anotasi on-PDF?** | 🔴 **OPEN** | Asumsi: upload gambar manual (screenshot/foto). Jika ternyata diinginkan anotasi langsung on-PDF (klik, gambar area, tulis komentar di overlay), kompleksitas naik drastis dan butuh library tambahan serta estimasi waktu berbeda. **Wajib resolved sebelum Sprint 3 dimulai** |

---

## 15. Acceptance Criteria

### Full System

- [ ] User dapat login dan logout dengan aman
- [ ] JWT **tidak** tersimpan di localStorage — hanya httpOnly Cookie
- [ ] 5x gagal login → account lock 30 mnt berfungsi
- [ ] Upload PDF berhasil, file non-PDF ditolak dengan pesan error jelas
- [ ] ID Regulatory di-generate otomatis, unik, format sesuai spesifikasi
- [ ] Halaman `/e/{uuid}` dapat diakses tanpa login, menampilkan tabular metadata + status PENDING
- [ ] QR Original di-scan → redirect login jika belum login, tampilkan PDF setelah login
- [ ] File PDF tidak dapat diakses via URL path tanpa JWT (return 401)
- [ ] E-Sign stamp muncul di posisi global default pada PDF signed
- [ ] Semua aksi tercatat di audit_logs
- [ ] Approver dapat drag-and-drop QR stamp ke posisi yang diinginkan di PDF preview
- [ ] Approver dapat resize QR stamp dalam batas min–max yang dikonfigurasi
- [ ] Posisi stamp di PDF output akurat (toleransi ±2pt dari posisi yang dipilih) untuk PDF A4 portrait dan landscape
- [ ] System Settings page: perubahan default QR size/posisi berlaku untuk approval berikutnya
- [ ] SPV dapat approve + assign specific Marketing member via dropdown
- [ ] Dropdown auto-suggest approver yang sesuai kategori produk
- [ ] Marketing dapat approve (level final) tanpa field "Assign to"
- [ ] Email notifikasi terkirim ke approver yang relevan
- [ ] Bell notification menampilkan badge count akurat
- [ ] Superadmin menerima notif Forgot Password + dapat reset dari notifikasi
- [ ] Download signed_final.pdf tersedia setelah status APPROVED
- [ ] Superadmin dapat CRUD user dan assign role
- [ ] Superadmin dapat reassign approver pada dokumen PENDING
- [ ] Deactivate user yang sedang menjadi pending approver → sistem alert Superadmin
- [ ] Forgot Password flow end-to-end berfungsi
- [ ] Audit Log menampilkan semua action yang terdefinisi
- [ ] Form pengecekan menampilkan semua parameter aktif
- [ ] Parameter NG wajib diisi remarks + gambar sebelum submit
- [ ] PDF laporan memiliki 3 bagian: hasil pengecekan, tabel remarks (dengan thumbnail gambar), lampiran PDF design
- [ ] Laporan dapat didownload dari halaman detail dokumen
- [ ] Generate laporan dengan 0 NG (semua OK): tidak ada bagian tabel remarks
- [ ] Generate laporan dengan semua NG: semua parameter muncul di tabel remarks

---

*PRD v1.2 — 12 Juni 2026*
*Dokumen ini adalah living document. Perubahan requirement setelah sign-off melalui change request formal.*
