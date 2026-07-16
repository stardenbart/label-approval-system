-- Footer stamp font size + orientation controls (ID Regulatory / Nama Label / Nama File).
-- Additive columns with defaults matching prior hardcoded behavior (7pt, no rotation),
-- so documents stamped before this feature existed render unchanged.
ALTER TABLE `document_footer_positions`
  ADD COLUMN `font_size` DECIMAL(4,1) NOT NULL DEFAULT 7 AFTER `height_pt`,
  ADD COLUMN `rotation` SMALLINT NOT NULL DEFAULT 0 AFTER `font_size`;
