-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('superadmin', 'admin', 'approver', 'viewer') NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `must_change_pwd` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(10) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `product_groups_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `group_id` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `sub_group` VARCHAR(100) NULL,
    `product_code` CHAR(5) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_approver_mappings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_group_id` INTEGER NOT NULL,
    `approver_user_id` VARCHAR(36) NOT NULL,
    `level` TINYINT NOT NULL DEFAULT 2,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `product_approver_mappings_product_group_id_level_key`(`product_group_id`, `level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` VARCHAR(36) NOT NULL,
    `regulatory_id` VARCHAR(40) NOT NULL,
    `product_category_id` INTEGER NOT NULL,
    `label_name` VARCHAR(200) NOT NULL,
    `file_name_original` VARCHAR(255) NOT NULL,
    `path_original` VARCHAR(500) NOT NULL,
    `path_signed_level1` VARCHAR(500) NULL,
    `path_signed_final` VARCHAR(500) NULL,
    `path_check_report` VARCHAR(500) NULL,
    `status` ENUM('PENDING_APPROVAL', 'APPROVED', 'DECLINED') NOT NULL DEFAULT 'PENDING_APPROVAL',
    `uploaded_by` VARCHAR(36) NOT NULL,
    `tanggal_terima` DATE NOT NULL,
    `tanggal_periksa` DATE NOT NULL,
    `tanggal_verifikasi` DATE NULL,
    `tanggal_approval` DATE NULL,
    `qr_path_original` VARCHAR(500) NULL,
    `qr_path_esign` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `documents_regulatory_id_key`(`regulatory_id`),
    INDEX `idx_doc_status`(`status`, `deleted_at`),
    INDEX `idx_doc_uploader`(`uploaded_by`, `status`),
    INDEX `idx_doc_category`(`product_category_id`, `status`),
    INDEX `idx_doc_terima`(`tanggal_terima`),
    INDEX `idx_doc_approval`(`tanggal_approval`),
    INDEX `idx_doc_regulatory`(`regulatory_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_approvals` (
    `id` VARCHAR(36) NOT NULL,
    `document_id` VARCHAR(36) NOT NULL,
    `approver_id` VARCHAR(36) NOT NULL,
    `assigned_by` VARCHAR(36) NULL,
    `level` TINYINT NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'DECLINED') NOT NULL DEFAULT 'PENDING',
    `next_approver_id` VARCHAR(36) NULL,
    `path_signed` VARCHAR(500) NULL,
    `notes` TEXT NULL,
    `signed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_approval_approver`(`approver_id`, `status`),
    INDEX `idx_approval_doc`(`document_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_esign_positions` (
    `id` VARCHAR(36) NOT NULL,
    `document_id` VARCHAR(36) NOT NULL,
    `approval_id` VARCHAR(36) NOT NULL,
    `page_number` INTEGER NOT NULL DEFAULT 1,
    `x_percent` DECIMAL(6, 3) NOT NULL,
    `y_percent` DECIMAL(6, 3) NOT NULL,
    `width_pt` DECIMAL(7, 2) NOT NULL,
    `height_pt` DECIMAL(7, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `document_esign_positions_approval_id_key`(`approval_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_settings` (
    `key` VARCHAR(100) NOT NULL,
    `value` TEXT NOT NULL,
    `description` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `type` ENUM('APPROVAL_ASSIGNED', 'APPROVAL_DONE', 'APPROVAL_DECLINED', 'FORGOT_PASSWORD', 'SYSTEM') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `message` TEXT NOT NULL,
    `entity_type` VARCHAR(50) NULL,
    `entity_id` VARCHAR(100) NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user_unread`(`user_id`, `is_read`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity` VARCHAR(50) NULL,
    `entity_id` VARCHAR(100) NULL,
    `ip_address` VARCHAR(45) NULL,
    `meta` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_audit_date`(`created_at` DESC),
    INDEX `idx_audit_user`(`user_id`, `created_at` DESC),
    INDEX `idx_audit_action`(`action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_refresh_hash`(`token_hash`),
    INDEX `idx_refresh_user`(`user_id`, `revoked`),
    INDEX `idx_refresh_expires`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `label_check_parameters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT true,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `label_check_forms` (
    `id` VARCHAR(36) NOT NULL,
    `document_id` VARCHAR(36) NOT NULL,
    `checked_by` VARCHAR(36) NOT NULL,
    `overall_status` VARCHAR(10) NULL,
    `submitted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `label_check_forms_document_id_key`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `label_check_results` (
    `id` VARCHAR(36) NOT NULL,
    `form_id` VARCHAR(36) NOT NULL,
    `parameter_id` INTEGER NOT NULL,
    `status` VARCHAR(2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `label_check_results_form_id_parameter_id_key`(`form_id`, `parameter_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `label_check_remarks` (
    `id` VARCHAR(36) NOT NULL,
    `result_id` VARCHAR(36) NOT NULL,
    `description` TEXT NOT NULL,
    `remarks_text` TEXT NOT NULL,
    `image_path` VARCHAR(500) NOT NULL,
    `image_filename` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_categories` ADD CONSTRAINT `product_categories_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `product_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_approver_mappings` ADD CONSTRAINT `product_approver_mappings_product_group_id_fkey` FOREIGN KEY (`product_group_id`) REFERENCES `product_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_approver_mappings` ADD CONSTRAINT `product_approver_mappings_approver_user_id_fkey` FOREIGN KEY (`approver_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_product_category_id_fkey` FOREIGN KEY (`product_category_id`) REFERENCES `product_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_approvals` ADD CONSTRAINT `document_approvals_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_approvals` ADD CONSTRAINT `document_approvals_approver_id_fkey` FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_approvals` ADD CONSTRAINT `document_approvals_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_approvals` ADD CONSTRAINT `document_approvals_next_approver_id_fkey` FOREIGN KEY (`next_approver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_esign_positions` ADD CONSTRAINT `document_esign_positions_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_esign_positions` ADD CONSTRAINT `document_esign_positions_approval_id_fkey` FOREIGN KEY (`approval_id`) REFERENCES `document_approvals`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `label_check_forms` ADD CONSTRAINT `label_check_forms_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `label_check_forms` ADD CONSTRAINT `label_check_forms_checked_by_fkey` FOREIGN KEY (`checked_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `label_check_results` ADD CONSTRAINT `label_check_results_form_id_fkey` FOREIGN KEY (`form_id`) REFERENCES `label_check_forms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `label_check_results` ADD CONSTRAINT `label_check_results_parameter_id_fkey` FOREIGN KEY (`parameter_id`) REFERENCES `label_check_parameters`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `label_check_remarks` ADD CONSTRAINT `label_check_remarks_result_id_fkey` FOREIGN KEY (`result_id`) REFERENCES `label_check_results`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `documents` ADD COLUMN `path_signed_level0` VARCHAR(500) NULL AFTER `path_original`;

ALTER TABLE `document_approvals` ADD COLUMN `qr_path` VARCHAR(500) NULL AFTER `path_signed`;

ALTER TABLE `users` MODIFY COLUMN `role` ENUM(`superadmin`, `admin`, `approver`, `viewer`, `uploader`) NOT NULL;

ALTER TABLE `product_categories` ADD UNIQUE INDEX `product_categories_product_code_key` (`product_code`);