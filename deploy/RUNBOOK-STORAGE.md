# Runbook — Migrasi Penyimpanan DAL

Tiga perubahan penyimpanan, dijalankan berurutan. Masing-masing berdiri sendiri:
kamu boleh berhenti setelah fase mana pun dan sistem tetap benar.

| Fase | Yang berubah | Penghematan | Bisa dibalik? |
|---|---|---|---|
| 1 · Dedup | PDF identik berbagi inode lewat hard link | ~26–49% | Ya — salin ulang berkasnya |
| 2 · Manifest | Berkas turunan dirender saat diminta, bukan disimpan | ~38% dari sisanya | Ya — berkas lama disimpan sampai `--prune` |
| 3 · Kompresi | Berkas arsip dikompresi Ghostscript | ~58% dari arsip | **Tidak** — lossy |

**Aturan yang tidak boleh dilanggar:** `original.pdf` tidak pernah disentuh oleh
fase mana pun. Itulah yang membuat Fase 2 dan 3 aman — apa pun yang hilang dari
salinan selalu bisa diturunkan ulang dari sumbernya.

---

## Sebelum mulai

```bash
cd /var/www/dal-system/backend
npm run storage:doctor
```

Harus **tidak ada GAGAL**. Yang paling sering muncul dan artinya:

| Temuan | Artinya | Tindakan |
|---|---|---|
| `hard link gagal` | Filesystem tidak mendukung hard link | Fase 1 tidak akan menghemat apa pun. Jangan dijalankan. |
| `tmp dan documents BEDA filesystem` | Setiap upload disalin penuh | Pindahkan `tmp` ke partisi yang sama dengan `documents` |
| `STORAGE_PATH relatif` | PM2 dan cron bisa menulis ke folder berbeda | Ubah ke path absolut, lalu restart |
| `Ghostscript tidak ada` | Fase 3 akan dilewati diam-diam | `sudo apt install ghostscript` |
| `kolom documents.stamp_manifest TIDAK ADA` | Migrasi belum jalan | `npx prisma migrate deploy` |
| `berkas dirujuk database tapi tidak ada di disk` | Data sudah tidak konsisten | **Selesaikan ini dulu.** Jangan migrasi di atas storage yang rusak. |

Catat angka dari bagian **Kondisi data** — itu pembanding untuk sesudahnya.

```bash
sudo bash deploy/backup.sh          # WAJIB. Dump database saja tidak cukup.
```

---

## Urutan: staging dulu, selalu

Staging harus memakai **salinan data produksi**, bukan data contoh. Yang dicari
justru dokumen-dokumen tua yang bentuknya tidak seragam — itulah yang bikin
kejutan, dan itu tidak ada di data contoh.

```bash
# di produksi
sudo bash deploy/backup.sh
# di staging
gunzip -c dal_db_*.sql.gz | mysql -u root -p dal_db
tar -xzf dal_storage_*.tar.gz -C /var/www/dal-system/backend/storage/
```

tar mempertahankan hard link secara bawaan, baik saat membuat maupun
mengekstrak — **jangan** menambahkan `-H`, karena pada GNU tar itu berarti
`--format` dan perintahnya gagal dengan `f: Invalid archive format`. Yang
merusak tautan adalah `--hard-dereference`.

Untuk **rsync** ceritanya berbeda: di sana `-H` MEMANG wajib, karena rsync tidak
mempertahankan hard link kecuali diminta.

Jalankan seluruh runbook di staging sampai selesai. Baru sentuh produksi.

---

## Fase 1 — Dedup

```bash
npm run storage:dedupe                    # dry run, tidak mengubah apa pun
npm run storage:dedupe -- --apply
```

**Periksa:**

```bash
npm run storage:doctor                    # "dihemat dedup" harus muncul
```

Buka 3–4 dokumen lewat aplikasi dan unduh PDF-nya. Berkas yang berbagi inode
harus tetap terbuka normal — kalau satu rusak, semuanya rusak, jadi cukup
periksa beberapa.

**Kalau harus dibatalkan:** pulihkan `storage/documents` dari backup. Atau,
karena hard link tidak mengubah isi berkas sama sekali, cukup salin ulang tiap
berkas ke dirinya sendiri (`cp x x.tmp && mv x.tmp x`) untuk memutus tautannya.

**Setelah ini berlaku selamanya:** setiap penyalinan berkas harus
mempertahankan hard link. `tar` sudah melakukannya sendiri; `rsync` **tidak** —
di sana `-H` wajib ditambahkan. Tanpa itu tautan mekar jadi salinan penuh dan
penghematannya hilang di arsip. Perhatikan juga `deploy.sh`: ia memakai
`rsync --delete` untuk kode, tapi mengecualikan `storage/`, jadi berkas dokumen
tidak pernah lewat sana.

---

## Fase 2 — Manifest

Dipecah tiga perintah dengan sengaja: mengisi kolom tidak merusak apa pun dan
bisa diulang, menghapus berkas tidak bisa dibatalkan. Jangan disatukan.

```bash
npm run storage:manifest                  # dry run
npm run storage:manifest -- --apply       # hanya mengisi kolom, tidak menyentuh berkas
```

Biarkan berjalan **beberapa hari** sebelum melanjutkan. Selama itu, dokumen baru
memakai jalur manifest sementara dokumen lama masih dilayani dari berkasnya —
kalau ada yang salah, ia akan muncul tanpa satu berkas pun sudah dihapus.

Yang dipantau selama masa itu:

```bash
grep -i "renderStamped\|stamp manifest\|Unsupported" /var/log/dal/pm2-err.log
```

Lalu buktikan berkasnya memang bisa dibuat ulang:

```bash
npm run storage:manifest -- --verify
```

Perbandingannya bukan byte — pdf-lib menyusun objek berbeda tiap menyimpan —
melainkan jumlah halaman, ukuran halaman, jumlah gambar, dan teks.

**Sebagian dokumen akan sengaja TIDAK cocok.** Ada tiga sebab, dan ketiganya
benar:

| Pesan | Artinya |
|---|---|
| `jumlah gambar 3 vs 2` | Di-stamp sebelum aturan "satu QR per dokumen"; berkasnya memuat QR per level |
| `isi gambar berbeda (…)` | Jumlah QR-nya sama, tapi **tujuannya berbeda** — berkas lama menunjuk `/e/approval/<id>`, render baru `/e/<dokumen>` |
| `manifest hasil backfill` | Manifest disusun ulang oleh skrip, bukan direkam saat penempelan |

Baris kedua itu yang paling halus dan paling berbahaya. Dokumen yang berhenti
di Level 0 hanya membawa **satu** QR, jadi strukturnya identik dengan hasil
render sekarang — hanya isinya yang berbeda. Sidik jari versi pertama
menyatakan keduanya sama dan akan membiarkan berkasnya dihapus, sehingga QR
pada label berubah tujuan tanpa peringatan. Di produksi ada **20 dokumen**
seperti itu.

**Berkas yang tidak cocok dipertahankan.** Itu bukan sampah — itu satu-satunya
salinan dari apa yang sungguh-sungguh tercetak, dan tidak bisa dibuat ulang.
Jangan dipaksa dengan `--force` tanpa alasan tertulis.

> **Verifikasi adalah gerbang SEBELUM kompresi.** Arsip yang sudah dikompresi
> Ghostscript tidak akan pernah cocok dengan render segar — gambarnya sudah
> JPEG, render menghasilkan Flate. Menjalankan `--verify` pada arsip
> terkompresi akan selalu melaporkan `isi gambar berbeda`, dan itu wajar.

Baru setelah itu:

```bash
npm run storage:manifest -- --verify --prune
```

**Periksa:** unduh PDF ber-stamp dari dokumen yang berkasnya sudah dibuang.
Harus tetap keluar, dengan jeda kecil pada permintaan pertama (~25 ms render)
dan instan pada permintaan berikutnya (cache).

**Kalau harus dibatalkan:** pulihkan `storage/documents` dari backup dan revert
kode. Kolom `stamp_manifest` boleh dibiarkan — nullable, dan kode lama
mengabaikannya.

---

## Fase 3 — Kompresi

**Ini satu-satunya fase yang tidak bisa dibalik.** Sebelum menjalankannya,
pastikan jawaban atas pertanyaan ini sudah jelas: apakah PDF final yang
ditandatangani harus tersedia dalam bentuk byte yang persis sama seperti saat
disetujui? Kalau jawabannya ya, jangan jalankan fase ini — setel
`archive_compression_preset` ke `none` di System Settings.

Kalau tidak, berkas arsip boleh dikompresi. Versi mutu penuh tetap tersedia
lewat `?quality=full` karena diturunkan ulang dari `original.pdf`.

```bash
npm run storage:compress                  # dry run
npm run storage:compress -- --apply
```

Secara bawaan skrip **hanya** menyentuh arsip yang terbukti bisa dibuat ulang.
Arsip yang tidak bisa (dokumen pra-refactor yang sama dengan Fase 2) dilewati,
karena pada berkas itu kompresi lossy membuang mutu tanpa jaring pengaman.
`--force` melewati penjagaan ini — jangan dipakai tanpa alasan tertulis.

**Periksa — dan ini pemeriksaan yang paling penting di seluruh runbook:**

Cetak satu label hasil kompresi, lalu **pindai QR-nya dengan ponsel sungguhan**.
Diuji dengan jsQR, preset `ebook` masih terbaca sampai QR berukuran 14mm,
sementara minimum kebijakan 21mm. Tapi kamera ponsel di gudang dengan
pencahayaan buruk bukan jsQR di laboratorium. Uji sekali, di kondisi nyata.

| preset | ukuran | QR 21mm (min. kebijakan) |
|---|---|---|
| `none` | penuh | terbaca |
| `prepress` | −14% | terbaca |
| `ebook` (bawaan) | −58% | terbaca |
| `screen` | −90% | **gagal pada foto beresolusi rendah** |

`screen` tersedia tapi bukan bawaan justru karena baris terakhir itu.

**Kalau harus dibatalkan:** pulihkan `storage/documents` dari backup. Merender
ulang dari manifest juga mengembalikan mutu penuh, tapi tidak menghasilkan berkas
yang identik byte dengan arsip sebelum dikompresi.

---

## Sesudah semuanya

```bash
npm run storage:doctor                    # bandingkan dengan angka di awal
```

Pasang backup harian kalau belum:

```bash
echo '0 1 * * * root bash /var/www/dal-system/deploy/backup.sh >> /var/log/dal/backup.log 2>&1' \
  | sudo tee /etc/cron.d/dal-backup
```

Dan sekali, sungguhan, pulihkan backup ke database uji. Backup yang tidak pernah
diuji bukan backup.

---

## Hal-hal yang gampang terlewat

**PM2 cluster.** `ecosystem.config.js` menjalankan 2 instance. Cron hanya
dipasang di instance 0 (`NODE_APP_INSTANCE`); tanpa itu setiap pekerjaan
terjadwal berjalan dua kali. Kalau jumlah instance diubah, ini tetap benar.

**Cache boleh dihapus kapan saja.** `storage/cache/stamped/` bukan data.
`rm -rf` di sana tidak menghilangkan apa pun, hanya membuat permintaan
berikutnya perlu ~25 ms lebih lama. Ia dibersihkan sendiri tiap hari 03:30.

**`APP_URL` menentukan isi QR yang tercetak.** Salah nilai berarti label yang
sudah dicetak menunjuk ke alamat yang tidak ada, dan itu tidak bisa diperbaiki
tanpa cetak ulang. Periksa sebelum dokumen pertama di-approve di lingkungan baru.

**Ghostscript opsional.** Tidak ada `gs` bukan error — kompresi dilewati dengan
peringatan di log. Artinya kalau lupa memasangnya, Fase 3 tampak berjalan tapi
tidak menghemat apa pun. `storage:doctor` menyebutkan ini.
