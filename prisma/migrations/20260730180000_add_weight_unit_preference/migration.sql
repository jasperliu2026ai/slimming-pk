-- AlterTable
ALTER TABLE `users`
    ADD COLUMN `preferredWeightUnit` ENUM('kg', 'jin') NOT NULL DEFAULT 'kg';
