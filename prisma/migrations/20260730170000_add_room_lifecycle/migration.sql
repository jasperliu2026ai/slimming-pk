-- AlterTable
ALTER TABLE `room_members`
    ADD COLUMN `archivedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `pk_rooms`
    ADD COLUMN `sourceRoomId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `pk_rooms_sourceRoomId_idx` ON `pk_rooms`(`sourceRoomId`);

-- AddForeignKey
ALTER TABLE `pk_rooms`
    ADD CONSTRAINT `pk_rooms_sourceRoomId_fkey`
    FOREIGN KEY (`sourceRoomId`) REFERENCES `pk_rooms`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `restart_invitations` (
    `id` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `inviterId` VARCHAR(191) NOT NULL,
    `inviteeId` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `decidedAt` DATETIME(3) NULL,

    UNIQUE INDEX `restart_invitations_roomId_inviteeId_key`(`roomId`, `inviteeId`),
    INDEX `restart_invitations_inviteeId_status_createdAt_idx`(`inviteeId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `restart_invitations`
    ADD CONSTRAINT `restart_invitations_roomId_fkey`
    FOREIGN KEY (`roomId`) REFERENCES `pk_rooms`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `restart_invitations`
    ADD CONSTRAINT `restart_invitations_inviterId_fkey`
    FOREIGN KEY (`inviterId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `restart_invitations`
    ADD CONSTRAINT `restart_invitations_inviteeId_fkey`
    FOREIGN KEY (`inviteeId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
