-- CreateTable
CREATE TABLE `join_requests` (
    `id` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `initialWeightKg` DECIMAL(5, 2) NOT NULL,
    `initialPhotoUrl` VARCHAR(500) NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `decidedAt` DATETIME(3) NULL,

    UNIQUE INDEX `join_requests_roomId_userId_key`(`roomId`, `userId`),
    INDEX `join_requests_roomId_status_createdAt_idx`(`roomId`, `status`, `createdAt`),
    INDEX `join_requests_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `join_requests`
    ADD CONSTRAINT `join_requests_roomId_fkey`
    FOREIGN KEY (`roomId`) REFERENCES `pk_rooms`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `join_requests`
    ADD CONSTRAINT `join_requests_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
