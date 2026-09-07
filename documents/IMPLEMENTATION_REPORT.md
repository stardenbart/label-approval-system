# DAL System — Laporan Penerapan

**Tanggal:** 7 September 2026
**Branch:** `fix/backend-validation-and-level-ceiling`
**Cakupan:** 14 commit · 49 berkas · +4.850 / −918 baris
**Status:** selesai dikerjakan dan diuji di staging lokal · **belum di-push**

---

## Ringkasan

| # | Pekerjaan | Hasil |
|---|---|---|
| A | Satu QR per dokumen, bukan satu per level | label membawa 1 QR, isinya hidup |
| B | Ukuran & posisi QR bisa diatur pengguna | react-rnd, preview = hasil cetak |
| C | Dedup penyimpanan (hard link) | −49% pada berkas asli |
| D | Berkas turunan dirender saat diminta | −38% dari sisa penyimpanan |
| E | Kompresi arsip (Ghostscript) | −58% tanpa menurunkan resolusi |
| F | Halaman verifikasi QR jujur pada status | 4 kasus, semuanya benar |
| G | Kesiapan staging & produksi | doctor, backup, runbook |
| H | Lint backend | 1 bug render ditemukan & diperbaiki |

---

## A. Satu QR per dokumen

**Masalah.** Setiap level menempel QR miliknya sendiri ke PDF, sehingga satu
label bisa membawa tiga QR yang masing-masing hanya mewakili satu approver.
Selain boros tempat di label, isinya beku: QR Level 1 tidak pernah tahu bahwa
Level 2 sudah menyetujui.

**Akar salah paham.** QR diperlakukan seperti stempel — tiap orang stempel
sendiri. Padahal QR adalah **alamat**, bukan gambar. Gambarnya tidak perlu
berubah; yang berubah cukup isi halaman yang dituju.

**Yang diterapkan.**

```
UPLOAD     original.pdf disimpan, TIDAK PERNAH diubah lagi
           qr_original.png dibuat → /e/<id-dokumen>

LEVEL 0    menentukan posisi QR + footer, dibekukan ke stamp_manifest
           TIDAK menulis PDF apa pun
LEVEL 1    approve; tidak menggambar apa pun ke PDF
LEVEL 2    approve (final); BARU di sini satu berkas arsip ditulis
```

Halaman `/e/<id-dokumen>` menampilkan seluruh rantai approval dan bertambah
sendiri setiap kali sebuah level menyetujui — **tanpa label perlu dicetak
ulang**.

QR per level tetap dibuat (`qr_approval_levelN.png`) untuk menelusuri
konfirmasi tiap level, tetapi **tidak pernah ditempel ke PDF**.

**Berkas:** `pdf.service.js`, `approval.controller.js`, `qr.service.js`

---

## B. Ukuran dan posisi QR yang bisa diatur

**Masalah.** Ukuran QR tidak bisa disesuaikan. Batasnya dijaga lima lapis yang
tidak saling tahu dan sudah menyimpang: form System Settings mengizinkan sampai
400pt, validasi saat approve memasang `Joi.number().max(200)` sebagai angka
mati, dan saat upload batasnya 500. Menaikkan batas lewat UI tampak berhasil,
lalu ditolak beberapa detik kemudian.

**Yang diterapkan.**

- `backend/src/config/stamp.js` — satu tempat untuk semua batas. Dipisah tegas:
  **batas teknis** (fisika: di bawah 20pt QR tidak terpindai) versus **batas
  kebijakan** (dari `system_settings`, diatur superadmin).
- `ESignCanvas` memakai react-rnd: kotak QR bisa digeser dan ditarik sudutnya,
  ada input ukuran numerik dan pembacaan dalam milimeter.
- **Bug preview diperbaiki:** kanvas dulu memperlakukan point sebagai pixel,
  sehingga preview meleset ~20% pada zoom bawaan dan 100% pada zoom 200%.
  Sekarang ada konversi `ptToPx`/`pxToPt` — **hasil cetak sama dengan preview**.
- Ukuran di luar rentang kebijakan **ditolak dengan pesan yang menyebut
  angkanya**, bukan diam-diam dikecilkan seperti sebelumnya.

**Berkas:** `config/stamp.js`, `ESignCanvas.jsx`, `settings.controller.js`,
`ApprovalPage.jsx`

---

## C. Dedup penyimpanan

**Pengukuran awal.** Label yang sama di-upload berulang kali selama revisi, dan
tiap upload menyimpan salinan penuhnya sendiri. Pada storage yang diukur:
**6 dari 9 PDF asli identik byte-per-byte** — dua kelompok masing-masing 3
salinan.

**Yang diterapkan.** Dedup berbasis **hard link**, bukan blob store
content-addressed:

- tiap dokumen tetap punya path-nya sendiri → kode yang membaca `path_original`
  tidak perlu tahu apa-apa
- tidak butuh refcount → inode hilang sendiri saat link terakhir dilepas
- bisa dibatalkan kapan saja → salin ulang berkasnya, selesai

Kolom baru `documents.original_sha256` (+ indeks). Saat upload, berkas di-hash,
dicari kembarannya, lalu ditautkan.

**Hasil:** 9 berkas → 5 salinan fisik · **6,44 MB → 3,27 MB (−49%)**

Upload duplikat menambah **0 byte** dan mendarat pada inode yang sama; menghapus
salah satu dokumen meninggalkan kembarannya utuh byte-per-byte.

> **Dua syarat yang tidak boleh dilanggar**
> 1. `tmp` dan `documents` **harus satu filesystem** — hard link tidak bisa
>    lintas partisi, dan `linkOrMove()` akan jatuh ke salinan penuh (EXDEV)
>    tanpa satu pun error.
> 2. Backup **wajib** memakai `tar -H` / `rsync -H`. Tanpa itu tautan mekar
>    jadi salinan penuh dan penghematannya hilang di arsip.

**Berkas:** `storage-dedup.service.js`, `scripts/dedupe-storage.js`,
migrasi `20260904100000_add_original_sha256`

---

## D. Berkas turunan dirender saat diminta

**Pengukuran.** Berkas `signed_*` adalah salinan **utuh** `original.pdf` yang
bedanya hanya 0,1–6,2 KB (satu QR dan tiga baris teks):

| Dokumen | original | signed_level0 | selisih |
|---|---|---|---|
| 08f3466d | 1487 KB | 1487 KB | **+0,1 KB** |
| 310427bd | 1216 KB | 1211 KB | **−4,5 KB** |
| ed15e71b | 407 KB | 409 KB | +2,8 KB |

**7,03 MB dari 10,30 MB — 50% dari seluruh storage** dipakai untuk menyimpan
~14 KB informasi baru. Merender ulang hanya perlu **~25 ms**, lebih cepat
daripada mengirimkannya lewat jaringan.

**Yang diterapkan.** Yang disimpan adalah **keputusannya**, bukan hasilnya:

```json
documents.stamp_manifest = {
  "v": 1,
  "qr":     { "page": 1, "xPct": 70, "yPct": 5, "wPt": 100, "hPt": 100 },
  "footer": { "page": 1, "xPct": 3, "yPct": 97, "wPt": 220, "hPt": 30,
              "fontSize": 7, "rotation": 0 },
  "footerText": ["ID Regulatory: …", "Nama Label: …", "Nama File: …"],
  "qrFile": ".../qr_original.png",
  "sourceSha": "…", "stampedAt": "…", "stampedBy": "…"
}
```

`pdf.service` dipecah tiga:

| Fungsi | Sifat |
|---|---|
| `resolveStampManifest()` | memutuskan; membaca settings sekali |
| `renderStamped()` | menggambar; **fungsi murni**, tanpa DB, tanpa settings |
| `writeFinalArchive()` | menulis; **hanya saat approval final** |

`stamped-cache.service` menyimpan hasil render dengan **hash manifest di nama
berkasnya**, sehingga manifest yang berubah otomatis meleset — tidak ada
invalidasi terpisah yang bisa terlupa. Isinya boleh dihapus kapan saja.

### Tiga sumber non-determinisme yang ditutup

Tanpa ini, regenerasi tidak akan menghasilkan berkas yang sama:

1. **Fallback ke System Settings saat render.** `overlayEsign()` dulu memakai
   default *saat itu* kalau posisi tidak dikirim. Superadmin mengubah default
   tahun depan → dokumen yang sudah disetujui dirender dengan tata letak
   berbeda. Semua fallback kini diselesaikan sekali, saat penempelan.
2. **Footer membaca record yang hidup.** `drawFooter` mengambil `labelName` dan
   `fileNameOriginal` langsung dari database. Edit nama label → stamp pada
   dokumen lama ikut berubah. Teksnya sekarang ikut dibekukan.
3. **Penjepitan ke ukuran halaman** dipindah ke waktu resolve, jadi angka di
   manifest sudah final.

**Hasil uji:** render 3× berturut-turut menghasilkan md5 **identik**; cache
miss 29 ms, cache hit 1 ms; manifest digeser 1% → hash berubah; `stampedAt`
berbeda → hash **tidak** berubah.

**Proyeksi:** 10,30 MB → **6,44 MB (−38%)**

**Berkas:** `pdf.service.js`, `stamped-cache.service.js`,
`scripts/backfill-stamp-manifest.js`, migrasi `20260905090000_add_stamp_manifest`

---

## E. Kompresi arsip dengan Ghostscript

**Pengukuran isi PDF.** 88% byte PDF adalah gambar, dan **100% gambarnya sudah
`/FlateDecode`** — sudah dikompresi zlib secara lossless. Itu sebabnya uji
kompresi lossless hanya menghasilkan 7%: tidak ada yang bisa dikompres lagi.

**Ghostscript, diukur pada berkas nyata** (1.487 KB, 7 halaman, 12 gambar):

| preset | dimensi gambar | ukuran | piksel bergeser >8 @600dpi |
|---|---|---|---|
| asli | 1249×706 Flate | 1.487 KB | — |
| `prepress` | 1249×706 JPEG | 1.277 KB (−14%) | 0,03% |
| **`ebook`** (bawaan) | **1249×706 JPEG** | **623 KB (−58%)** | 0,82% |
| `screen` | 416×235 JPEG | 151 KB (−90%) | 4,02% |

**Yang menentukan pilihan bawaan:** pada berkas DAL, `/ebook` **tidak
menurunkan resolusi sama sekali** — dimensi gambarnya sama persis dengan
aslinya. Ghostscript baru men-downsample kalau gambar melebihi 1,5× target, dan
artwork label di sini efektif ~200 dpi. Penghematan 58% itu murni dari mengganti
Flate dengan JPEG bermutu sedang.

### Uji keterpindaian QR (jsQR)

Ini pemeriksaan terpenting — JPEG bisa merusak QR sampai tidak terbaca.

| ukuran QR | `none` | `prepress` | `ebook` | `screen` |
|---|---|---|---|---|
| 67pt (24mm) — nyata | YYY | YYY | **YYY** | YYY |
| 60pt (21mm) — min. kebijakan | YYY | YYY | **YYY** | −YY |
| 40pt (14mm) | YYY | YYY | **YYY** | −−− |
| 20pt (7mm) — min. teknis | −−Y | −−− | −−− | −−− |

*Kolom = terbaca pada 100 / 150 / 200 dpi.*

`ebook` aman sampai **14mm**, jauh di bawah minimum kebijakan 21mm. `screen`
gagal justru **tepat di ukuran minimum kebijakan** — tersedia, tapi bukan bawaan.

> **Temuan sampingan:** QR 20pt rapuh **bahkan tanpa kompresi** (hanya terbaca
> di 200 dpi). Batas teknis 20pt terlalu longgar. Tidak diubah — di luar lingkup.

### Penjagaan

Hasil Ghostscript hanya dipakai kalau lolos **tiga** pemeriksaan:

1. keluaran tidak kosong
2. **jumlah halaman tidak berubah** — PDF yang kehilangan halaman tetap terbuka
   normal di viewer, jadi ini bukan formalitas
3. benar-benar lebih kecil — PDF berisi teks saja sering justru membesar

**Ghostscript adalah dependensi OPSIONAL.** Tidak ada `gs` → kompresi dilewati
dengan peringatan di log boot; tidak ada alur kerja yang berhenti.

**Yang membuat kompresi lossy tetap aman:** `original.pdf` tidak pernah
disentuh dan manifest tetap tersimpan, jadi versi mutu penuh selalu bisa dibuat
ulang — itulah yang dilayani `GET /documents/:id/signed?quality=full`.

`scripts/compress-archives.js` secara bawaan **hanya** menyentuh arsip yang
terbukti bisa dibuat ulang. Arsip yang tidak bisa (dokumen pra-refactor)
dilewati; butuh `--force` yang disengaja.

**Berkas:** `pdf-compress.service.js`, `pdf-fingerprint.service.js`,
`scripts/compress-archives.js`

---

## F. Halaman verifikasi QR yang jujur pada status

**Masalah.** `/e/approval/:id` memakai warna hijau, ikon perisai, judul
"Digital Signature Verification", nama approver sebagai headline, dan ditutup
kalimat "Signature Verification Successful" — **semuanya ditulis mati, tidak
pernah melihat status**. Approval yang MENUNGGU tampak seperti sudah
ditandatangani; approval yang DITOLAK pun begitu. Hanya badge kecil di pojok
yang benar.

Bukan kasus langka: QR level yang belum disetujui **sudah bisa diambil hari
ini** lewat `?preview=true` (HTTP 200, 2729 byte), jadi bisa di-screenshot,
dicetak, dan dipindai.

**Kasus yang lebih berbahaya.** Rantai `L0 setuju → L1 setuju → L2 TOLAK`
membuat dokumen **DITOLAK**, sementara QR Level 1 tetap `APPROVED` — dan itu
memang benar untuk level itu. Orang yang memindai QR Level 1 pada label tercetak
akan menyimpulkan labelnya sah.

**Yang diterapkan.** Warna, ikon, judul, kalimat pembuka, dan kalimat penutup
semuanya mengikuti status level, ditambah pita peringatan saat status dokumen
berlawanan:

| kasus | level | dokumen | hero | judul | penutup |
|---|---|---|---|---|---|
| normal | APPROVED | APPROVED | hijau | "Disetujui" | biru · terverifikasi |
| menunggu | PENDING | PENDING | **amber** | "Menunggu Persetujuan" | amber · belum ada tanda tangan |
| ditolak | DECLINED | DECLINED | **merah** | "Ditolak" | merah · level ini ditolak |
| **divergensi** | APPROVED | **DECLINED** | hijau | "Disetujui" | **amber + PERINGATAN** |

Pita peringatannya berbunyi:

> **Level ini disetujui, tetapi dokumen DITOLAK di Level 2.**
> Label ini tidak sah untuk dipakai. Status satu level tidak mewakili status dokumen.

Kalimat "terverifikasi" hanya boleh muncul kalau level itu disetujui **dan**
dokumennya tidak berakhir ditolak.

**Rute `/e/approval/:id` tidak boleh dimatikan.** Label **lama** yang sudah
tercetak membawa QR per level di badannya — dipindai dari `signed_final.pdf`
dokumen 08f3466d, isinya `http://localhost:5173/e/approval/e8e27012-…`. Label itu
sudah ada wujud fisiknya dan tidak bisa diperbaiki selain dengan cetak ulang.

### Kartu QR di halaman detail: dari empat jadi satu

Halaman detail punya dua kartu — "QR Code E-Sign" berisi **tiga** gambar QR per
level, dan "QR Code Original" berisi QR dokumen. Keempatnya menuju halaman yang
isinya sama (Identitas Dokumen + Riwayat Persetujuan), dan yang benar-benar
tercetak cuma QR dokumen.

Digabung jadi **satu kartu**: satu QR, plus daftar **Konfirmasi per Level**
tanpa gambar — nama, status, waktu, dan tombol "Unduh QR level ini". QR per
level tetap dibuat dan tetap bisa diunduh; yang hilang hanya penampilan
gambarnya, dan halaman tidak lagi memuat tiga blob QR setiap kali dibuka.

### Komponen bersama

Kedua halaman publik sudah menyimpang: identitas dokumen yang satu **berbahasa
Inggris dengan 8 baris**, yang lain **berbahasa Indonesia dengan 7 baris** —
dokumen yang sama, dua jawaban berbeda. `StatusBadge` disalin dua kali.

Sekarang `StatusBadge`, `DocumentIdentity`, `ApprovalChain`, dan `ProgressPill`
hidup di `components/PublicVerify/`, dan `CHAIN_SELECT` di server menyeragamkan
bentuk datanya. Logika keputusan tampilan dipisah ke `PublicVerify/status.js`
tanpa JSX supaya bisa diuji tanpa merender.

**Berkas:** `PublicVerify/index.jsx`, `PublicVerify/status.js`,
`ESignApprovalPublicPage.jsx`, `ESignPublicPage.jsx`, `DocumentDetailPage.jsx`,
`public.controller.js`

---

## G. Kesiapan staging dan produksi

### Bug produksi yang ditemukan

`ecosystem.config.js` menjalankan PM2 mode **cluster dengan 2 instance**,
sementara `app.js` memasang cron di tingkat modul. Artinya **setiap worker
memasang cron-nya sendiri**: dua `deleteMany` bersamaan pada tabel yang sama.
Sudah begitu sejak sebelum pekerjaan ini.

Sekarang cron hanya dipasang di instance 0 (`NODE_APP_INSTANCE` dari PM2).
Diuji: instance 0 → 3 cron, instance 1 → 0 cron, tanpa PM2 → 3 cron.

### `npm run storage:doctor`

Satu perintah yang dijalankan di mesin tujuan sebelum dan sesudah deploy.
Memeriksa hal-hal yang membuat fitur **gagal tanpa suara**:

| Temuan | Akibat kalau tidak ketahuan |
|---|---|
| hard link tidak didukung | dedup tidak menghemat apa pun |
| tmp ≠ documents (beda partisi) | tiap upload kena EXDEV, disalin penuh |
| `STORAGE_PATH` relatif | PM2 dan cron menulis ke folder berbeda |
| Ghostscript tidak ada | kompresi dilewati diam-diam |
| kolom migrasi belum ada | meledak saat runtime |
| berkas dirujuk DB tapi hilang | 404 di UI |

Keluar dengan kode 1 kalau ada yang gagal, jadi bisa jadi gerbang di
`deploy.sh`.

### `deploy/backup.sh`

DAL sebelumnya **tidak punya backup otomatis sama sekali**, padahal ketiga fase
penyimpanan mengubah berkas secara permanen.

- `tar -H` mempertahankan hard link — diuji: 5 tautan bertahan, dan setelah
  extract 3 dan 4 berkas tetap berbagi inode (14,30 MB logis → 10,56 MB fisik)
- `--single-transaction` — snapshot konsisten tanpa mengunci tabel
- dump terpotong tetap menghasilkan `.gz` yang tampak wajar, jadi skrip
  memverifikasi baris `Dump completed` dan menghitung tabel sebelum menyatakan
  berhasil

### `deploy/staging-local.sh`

Staging lokal yang terisolasi penuh dari development:

| | staging | dev |
|---|---|---|
| database | `dal_db_staging` | `dal_db` |
| storage | `.staging/storage` | `backend/storage` |
| backend | `:3002` | `:3001` |
| frontend | `:4174` | `:5173` |

Keduanya boleh jalan bersamaan. Konfigurasi dioper lewat environment saat proses
dijalankan — dotenv tidak menimpa variabel yang sudah ada, jadi nilai staging
menang atas `backend/.env` **tanpa mengubah berkas apa pun**.

`vite.config.js` kini membaca `VITE_DEV_PORT`, `VITE_DEV_HOST`, dan
`VITE_API_TARGET`. `VITE_DEV_HOST=0.0.0.0` adalah syarat menguji pemindaian QR:
"localhost" pada ponsel menunjuk ke ponsel itu sendiri, jadi `APP_URL` harus
memakai IP LAN.

### Lain-lain

- `setup.sh` memasang `ghostscript`, menyiapkan `/var/backups/dal` mode 700
  (backup memuat hash password dan token)
- `deploy.sh` backup sebelum apa pun, lalu `storage:doctor` setelah migrasi
  sebelum restart
- `.env.example` digabung, bukan diganti: nilai produksi lama dipertahankan,
  ditambah `GS_BINARY`, `GS_TIMEOUT_MS`, `BACKUP_DIR`, `USE_HTTPS`,
  `SEED_UPLOADER_PASSWORD`. Diperiksa silang dengan `process.env` yang
  benar-benar dibaca kode
- `.gitignore` di-commit — sebelumnya untracked, jadi pengecualian
  `ONBOARDING.md` hanya berlaku di satu mesin

---

## H. Lint backend

Backend tidak punya lint sama sekali. Ditambahkan ESLint 8 dengan format
`.eslintrc.cjs` yang sama dengan frontend.

Jalan pertama melaporkan 13 masalah. **Satu di antaranya bug render sungguhan:**

`label-check-report.service.js` meluapkan tabel parameter ke halaman baru dengan
`const newPage = pdfDoc.addPage(A4)` lalu **tidak pernah menggambar di sana** —
`page` masih menunjuk halaman pertama sementara `y` di-reset ke atas. Baris
setelah batas dilukis menimpa baris sebelumnya, dan halaman tambahannya keluar
kosong.

Diverifikasi dengan form 45 parameter: laporan sekarang menaruh 23 baris luapan
di halaman 2 (sebelumnya kosong), tanpa tumpang tindih di halaman 1.

Sisanya bobot mati: enam `require` tak terpakai, dua konstanta tak terpakai,
satu binding `doc` yang tidak pernah dibaca, dan sebuah fungsi yang
dideklarasikan di dalam blok `if` pada `seed.js`.

---

## I. Pemisahan staging dan produksi

**Jebakan yang ditemukan.** `deploy.sh` menerima argumen `staging` dan mencetak
"Deploy to staging", tetapi argumen itu **tidak pernah dipakai untuk apa pun
selain teks**:

```bash
ENV="${1:-production}"                             # baris 8  — argumen diterima
echo "Deploy to ${ENV}"                            # baris 14 — HANYA mencetak
APP_DIR="/var/www/dal-system"                      # selalu produksi
pm2 reload ecosystem.config.js --env production    # selalu produksi
```

Artinya `bash deploy/deploy.sh staging` **men-deploy ke produksi**: menimpa
berkasnya, menjalankan migrasi di database produksi, dan me-restart aplikasi
yang sedang dipakai orang — sambil menampilkan kata "staging" di layar.

**Yang diterapkan.** `deploy/env.sh` jadi satu-satunya tempat yang menentukan
lingkungan:

| | production | staging |
|---|---|---|
| folder | `/var/www/dal-system` | `/var/www/dal-system-staging` |
| proses PM2 | `dal-backend` | `dal-backend-staging` |
| port | 3001 | 3101 |
| backup | `/var/backups/dal` | `/var/backups/dal-staging` |
| database | `dal_db` | `dal_db_staging` |
| instance PM2 | 2 (cluster) | 1 |

Di-source oleh `deploy.sh`, `pm2.sh`, `nginx.sh`, `backup.sh`, dan `setup.sh`.
`ecosystem.config.js` membaca `DAL_ENV` dan **menolak jalan** kalau tidak
disetel — tidak menebak. Berkas site Nginx dan berkas lognya juga dipisah per
lingkungan, dan port 3101 ikut ditutup di `firewall.sh`.

Tiga penjagaan baru:

1. **Tidak ada nilai bawaan.** Lupa argumen → skrip berhenti, bukan mengenai
   produksi.
2. **Lingkungan tak dikenal ditolak.** `deploy.sh produksi` (salah eja) berhenti.
3. **Produksi minta konfirmasi.** Harus mengetik `production` untuk melanjutkan;
   `CONFIRM=yes` melewatinya untuk CI, tapi harus disengaja.

## J. Test otomatis

Sebelumnya **nol** berkas test meski Jest dan supertest sudah terpasang.
Sekarang 51 test, semuanya lolos, sengaja diarahkan ke logika yang kalau rusak
**merusak berkas orang tanpa bersuara**:

| Berkas | Test | Yang dijaga |
|---|---|---|
| `tests/storage-dedup.test.js` | 7 | hash, penautan inode, penolakan saat ukuran beda, hapus satu tautan tidak menyentuh kembarannya |
| `tests/stamp-manifest.test.js` | 9 | render deterministik, tidak menulis ke disk, `original.pdf` tidak berubah, versi manifest asing ditolak, `stampedAt` tidak mengubah kunci cache |
| `tests/pdf-compress.test.js` | 5 | preset asing ditolak, `none` tidak menyentuh berkas, gs hilang ditangani anggun |
| `tests/pdf-fingerprint.test.js` | 6 | perbedaan halaman/ukuran/gambar/teks tertangkap |
| `tests/stamp-config.test.js` | 9 | min < max, default di dalam rentang, rotasi valid, konversi pt↔mm |
| `PublicVerify/__tests__/status.test.js` | 15 | hanya APPROVED yang boleh hijau, "terverifikasi" hanya saat benar, divergensi selalu diperingatkan |

Backend memakai Jest (`npm test`), frontend Vitest (`npm test`). Test tidak
menyentuh database maupun storage sungguhan; berkas sementara dibuat per test
dan dibersihkan sendiri.

---

## Perkakas baru

```bash
# Backend
npm run lint                                    # ESLint (src, prisma, tests)
npm test                                        # Jest — 36 test
npm run storage:doctor                          # kesiapan penyimpanan
npm run storage:dedupe        [-- --apply]      # dedup hard link
npm run storage:manifest      [-- --apply]      # isi stamp_manifest
npm run storage:manifest      -- --verify       # buktikan bisa dibuat ulang
npm run storage:manifest      -- --verify --prune
npm run storage:compress      [-- --apply]      # kompresi arsip
node scripts/seed-dummy-users.js                # akun uji (menolak di produksi)

# Deploy
bash deploy/backup.sh         <production|staging> [--db-only]
bash deploy/staging-local.sh  {up|down|reset|status|logs}   # staging di laptop
bash deploy/deploy.sh         <production|staging>          # WAJIB disebutkan
bash deploy/pm2.sh            <production|staging>
bash deploy/nginx.sh          <production|staging> [domain]
bash deploy/setup.sh          <production|staging>

# Frontend
npm test                                        # Vitest — 15 test
```

## Endpoint baru

```
GET /api/documents/:id/original                  berkas asli, tidak pernah dikompresi
GET /api/documents/:id/signed                    arsip terkompresi (kecil)
GET /api/documents/:id/signed?quality=full       dirender ulang dari asli, mutu penuh
GET /api/approvals/:id/qr?preview=true           QR level, dirender di memori
```

## Berkas baru

```
backend/src/config/stamp.js                     batas & default stamp, satu sumber
backend/src/services/storage-dedup.service.js   dedup hard link
backend/src/services/stamped-cache.service.js   cache PDF ber-stamp
backend/src/services/pdf-compress.service.js    kompresi Ghostscript
backend/src/services/pdf-fingerprint.service.js pembanding visual PDF
backend/scripts/storage-doctor.js               pemeriksaan kesiapan
backend/scripts/dedupe-storage.js               backfill dedup
backend/scripts/backfill-stamp-manifest.js      backfill manifest
backend/scripts/compress-archives.js            backfill kompresi
backend/scripts/seed-dummy-users.js             akun uji
backend/.eslintrc.cjs / .eslintignore
backend/jest.config.cjs + tests/               36 test backend
frontend/src/components/PublicVerify/index.jsx  komponen halaman publik bersama
frontend/src/components/PublicVerify/status.js  logika status, bisa diuji
frontend/src/services/queryKeys.js              registry kunci React Query
frontend/src/services/cacheSync.js              invalidasi cache terpusat
deploy/env.sh                                   resolusi lingkungan, satu sumber
deploy/backup.sh                                backup DB + berkas
deploy/staging-local.sh                         staging lokal terisolasi
deploy/RUNBOOK-STORAGE.md                       runbook migrasi penyimpanan
```

## Migrasi database

```
20260904100000_add_original_sha256    documents.original_sha256 CHAR(64) + indeks
20260905090000_add_stamp_manifest     documents.stamp_manifest JSON
```

Keduanya **nullable** — deploy tidak memutus apa pun, dokumen lama tetap
dilayani dari berkasnya.

---

## Hasil uji staging (7 September 2026)

Alur penuh lewat API sungguhan: upload (uploader) → L0 (approver) → L1 (admin)
→ L2 (superadmin).

```
original.pdf        7 halaman · 1 gambar · 1487 KB   tidak pernah tersentuh
signed_level0.pdf   7 halaman · 2 gambar ·  627 KB   arsip, dikompresi 58%
```

**2 gambar di halaman 1 = artwork + tepat satu QR.** Tidak ada
`signed_level1.pdf` maupun `signed_final.pdf`.

Pindai QR dari arsip yang sudah dikompresi:

```
100 dpi  TERBACA   http://192.168.79.132:4174/e/5cff29b4-…
150 dpi  TERBACA
200 dpi  TERBACA
300 dpi  TERBACA
```

Halaman yang dituju:

```
CYD01-070926-070926-P22K | Uji QR Staging | APPROVED (3 dari 3)
  Level 0  Disetujui  Dummy Approver     7 Sep 2026 01:40:52
  Level 1  Disetujui  Dummy Admin        7 Sep 2026 01:40:55
  Level 2  Disetujui  Dummy Superadmin   7 Sep 2026 01:40:59
```

Satu QR, tiga approval, semuanya tampil.

---

## Belum dijalankan — menunggu tindakan

Ketiganya mengubah berkas secara permanen, jadi **sengaja tidak otomatis**:

```bash
npm run storage:manifest -- --verify --prune    # buang berkas turunan
npm run storage:compress -- --apply             # kompresi arsip
```

Di produksi, urutan lengkapnya ada di **`deploy/RUNBOOK-STORAGE.md`**.

### Keputusan yang masih terbuka

**Fase kompresi di produksi.** Kompresi arsip **tidak bisa dibalik**. Kalau PDF
final yang ditandatangani harus tersedia dalam bentuk byte yang persis sama
seperti saat disetujui, setel `archive_compression_preset` ke `none` di System
Settings. **Ini keputusan kepatuhan, bukan keputusan teknis.**

**Dokumen pra-refactor.** Tiga dokumen di data dev sengaja **tidak lolos**
verifikasi manifest dengan pesan seperti `halaman 1: jumlah gambar 3 vs 2` —
berkasnya memuat QR per level yang tidak akan pernah digambar lagi. Itu benar;
berkas lamanya dipertahankan sebagai catatan apa yang sungguh-sungguh tercetak,
dan skrip menolak mengompresinya tanpa `--force`.

---

## Catatan yang gampang terlewat

**`APP_URL` menentukan isi QR yang tercetak.** Salah nilai berarti label yang
sudah dicetak menunjuk ke alamat yang tidak ada, dan itu tidak bisa diperbaiki
tanpa cetak ulang. Periksa sebelum dokumen pertama di-approve di lingkungan
baru.

**Backup wajib `-H`.** Setelah Fase C berlaku, setiap backup berkas tanpa
`tar -H` / `rsync -H` akan memekarkan tautan jadi salinan penuh.
`deploy/backup.sh` sudah benar; skrip backup lain belum tentu.

**`storage/cache/stamped/` bukan data.** `rm -rf` di sana tidak menghilangkan
apa pun, hanya membuat permintaan berikutnya perlu ~25 ms lebih lama. Dibersihkan
sendiri tiap hari 03:30.

**Ghostscript opsional.** Tidak ada `gs` bukan error — kompresi dilewati dengan
peringatan. Artinya kalau lupa memasangnya, Fase E tampak berjalan tapi tidak
menghemat apa pun. `storage:doctor` menyebutkan ini.

**Cakupan test masih sempit.** Ada 51 test (36 backend, 15 frontend) yang
menutup logika paling berbahaya — penautan hard link, determinisme manifest,
penjagaan sebelum arsip ditimpa, dan aturan tampilan status. Yang BELUM ada:
test integrasi HTTP (supertest terpasang tapi belum dipakai) dan test komponen
React. Verifikasi alur upload → L0 → L1 → L2 masih manual.
