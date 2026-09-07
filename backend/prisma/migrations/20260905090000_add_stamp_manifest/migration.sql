-- Manifest stamp: rekaman beku tentang apa PERSIS yang digambar ke PDF saat
-- Level 0 menyetujui.
--
-- Sebelumnya berkas hasil penempelan disimpan utuh (signed_level0.pdf), padahal
-- isinya salinan penuh original.pdf yang bedanya cuma ~3 KB. Dengan manifest,
-- berkasnya bisa dibuat ulang kapan saja (~25 ms) sehingga tidak perlu disimpan.
--
-- Nullable dengan sengaja: dokumen lama tetap dilayani dari berkasnya sampai
-- scripts/backfill-stamp-manifest.js mengisi kolom ini.
ALTER TABLE `documents` ADD COLUMN `stamp_manifest` JSON NULL AFTER `path_check_report`;
