-- AlterTable: allow a ProductApproverMapping row to target a specific
-- ProductCategory (only meaningful/allowed at level 0 — enforced in app code).
ALTER TABLE `product_approver_mappings` ADD COLUMN `product_category_id` INTEGER NULL AFTER `product_group_id`;

-- CreateIndex
CREATE UNIQUE INDEX `product_approver_mappings_product_category_id_level_key` ON `product_approver_mappings`(`product_category_id`, `level`);

-- AddForeignKey
ALTER TABLE `product_approver_mappings` ADD CONSTRAINT `product_approver_mappings_product_category_id_fkey` FOREIGN KEY (`product_category_id`) REFERENCES `product_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: one persisted footer stamp position per document (ID Regulatory /
-- Nama Label / Nama File), set once at Level 0 and reused unchanged through
-- every subsequent approval level.
CREATE TABLE `document_footer_positions` (
    `id` VARCHAR(36) NOT NULL,
    `document_id` VARCHAR(36) NOT NULL,
    `page_number` INTEGER NOT NULL DEFAULT 1,
    `x_percent` DECIMAL(6, 3) NOT NULL,
    `y_percent` DECIMAL(6, 3) NOT NULL,
    `width_pt` DECIMAL(7, 2) NOT NULL,
    `height_pt` DECIMAL(7, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `document_footer_positions_document_id_key`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `document_footer_positions` ADD CONSTRAINT `document_footer_positions_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
