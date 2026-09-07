-- Dedup penyimpanan: sha256 isi PDF asli.
-- Nullable karena dokumen lama belum punya nilainya sampai skrip backfill jalan.
ALTER TABLE `documents` ADD COLUMN `original_sha256` CHAR(64) NULL;
CREATE INDEX `idx_doc_sha256` ON `documents`(`original_sha256`);
