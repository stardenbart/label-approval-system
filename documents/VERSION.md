# Versi

Skema: `MAJOR.MINOR.PATCH+build.<tanggal>.<commit>`

Bagian `+build` adalah **metadata snapshot** — menandai build mana yang sedang
berjalan di sebuah lingkungan. Menurut semver ia tidak mempengaruhi urutan
versi (`2.0.0+build.x` setara dengan `2.0.0`), jadi aman dipakai untuk
menandai snapshot staging tanpa mengacaukan perbandingan versi.

| Lingkungan | Versi | Commit |
|---|---|---|
| staging | `2.0.0+build.20260907.8e9469c` | `8e9469c` |
| production | `1.0.0` | `adf15ee` |

---

## 2.0.0 — 7 September 2026

Rilis **mayor**. Dua hal yang memaksa naik mayor, bukan minor:

**Antarmuka operator berubah.** `deploy.sh`, `pm2.sh`, `nginx.sh`, dan
`setup.sh` sekarang WAJIB menerima argumen lingkungan
(`production` / `staging`). Skrip lama yang memanggilnya tanpa argumen akan
berhenti — dan itu memang disengaja: sebelumnya bawaannya `production`,
sehingga lupa argumen berarti mengenai server sungguhan.
`ecosystem.config.js` juga menolak jalan tanpa `DAL_ENV`.

**Yang terlihat pengguna berubah.** Label kini membawa **satu** QR, bukan tiga.
QR itu menunjuk ke halaman yang isinya bertambah sendiri seiring approval
berjalan, jadi label tidak perlu dicetak ulang.

### Ditambahkan
- Dedup penyimpanan berbasis hard link (−49% pada berkas asli)
- Berkas ber-stamp dirender saat diminta dari `stamp_manifest` (−38%)
- Kompresi arsip dengan Ghostscript (−58%, resolusi gambar tidak berubah)
- `GET /documents/:id/signed?quality=full` — versi mutu penuh
- `npm run storage:doctor` — pemeriksaan kesiapan penyimpanan
- `deploy/backup.sh` — backup database + berkas, hard link dipertahankan
- `deploy/staging-local.sh` — staging terisolasi di mesin pengembang
- 51 test otomatis (36 backend Jest, 15 frontend Vitest)

### Diperbaiki
- Cron berjalan ganda di PM2 cluster mode (2 instance = 2× tiap pekerjaan)
- Halaman verifikasi QR per level selalu tampak "berhasil" apa pun statusnya
- Preview e-sign meleset karena point diperlakukan sebagai pixel
- Tabel laporan label-check meluap ke halaman kosong

### Migrasi
- `20260904100000_add_original_sha256`
- `20260905090000_add_stamp_manifest`

Keduanya nullable — deploy tidak memutus dokumen lama.

### Setelah deploy
Tiga skrip penyimpanan mengubah berkas secara permanen dan **tidak** berjalan
otomatis. Urutannya ada di `deploy/RUNBOOK-STORAGE.md`.
