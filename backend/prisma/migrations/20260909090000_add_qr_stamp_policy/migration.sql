-- Kebijakan QR per dokumen. Default baru mengikuti kebutuhan operasional:
-- satu QR untuk setiap level approval, disusun horizontal.
ALTER TABLE `documents`
  ADD COLUMN `qr_stamp_mode` VARCHAR(20) NOT NULL DEFAULT 'document',
  ADD COLUMN `qr_layout` VARCHAR(20) NOT NULL DEFAULT 'horizontal';

-- Baris lama mempertahankan perilaku satu QR dokumen. Hanya upload baru yang
-- memakai default per-level, sehingga approval lama tidak berubah di tengah alur.
ALTER TABLE `documents`
  ALTER COLUMN `qr_stamp_mode` SET DEFAULT 'per_level';
