-- AlterTable
ALTER TABLE `users`
    ADD COLUMN `test_owner_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `users_test_owner_id_idx` ON `users`(`test_owner_id`);

-- AddForeignKey
ALTER TABLE `users`
    ADD CONSTRAINT `users_test_owner_id_fkey`
    FOREIGN KEY (`test_owner_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
