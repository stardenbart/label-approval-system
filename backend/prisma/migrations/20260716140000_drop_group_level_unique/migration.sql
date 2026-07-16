-- Fix: the (product_group_id, level) unique index was too broad — MySQL unique
-- indexes can't express "only when product_category_id IS NULL", so ANY row
-- sharing a group+level (whether it's the group-default row or a product-specific
-- override) collided with any other row for that same group+level, blocking
-- legitimate multiple category overrides within one group at Level 0.
--
-- "One group-default row per group+level" is now enforced in application code
-- instead (see backend/src/controllers/user.controller.js#setMapping and
-- backend/prisma/seed.js). Category-specific rows remain safely covered by
-- uq_category_level (product_category_id, level) — that index is unaffected,
-- since product_category_id is never null in that branch.
--
-- NOTE: InnoDB was using this composite index's leftmost column (product_group_id)
-- to satisfy the `product_approver_mappings_product_group_id_fkey` foreign key
-- constraint. A plain index must exist on product_group_id BEFORE dropping the
-- old unique index, or MySQL refuses with error 1553.
CREATE INDEX `product_approver_mappings_product_group_id_idx` ON `product_approver_mappings`(`product_group_id`);

ALTER TABLE `product_approver_mappings` DROP INDEX `product_approver_mappings_product_group_id_level_key`;
