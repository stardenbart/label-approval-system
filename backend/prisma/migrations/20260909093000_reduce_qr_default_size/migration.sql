-- Kecilkan QR bawaan untuk mode multi-level. Hanya ubah instalasi yang masih
-- memakai nilai bawaan lama; custom setting milik user tidak disentuh.
UPDATE `system_settings`
SET `value` = '48'
WHERE `key` IN ('qr_default_width_pt', 'qr_default_height_pt')
  AND `value` = '100';

UPDATE `system_settings`
SET `value` = '36'
WHERE `key` = 'qr_min_width_pt'
  AND `value` = '60';
