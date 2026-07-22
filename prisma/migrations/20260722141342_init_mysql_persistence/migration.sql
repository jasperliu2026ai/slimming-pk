-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `openid` VARCHAR(128) NOT NULL,
    `unionid` VARCHAR(128) NULL,
    `nickname` VARCHAR(32) NOT NULL DEFAULT '',
    `avatarUrl` VARCHAR(500) NOT NULL DEFAULT '',
    `gender` ENUM('male', 'female', 'unknown') NOT NULL DEFAULT 'unknown',
    `heightCm` INTEGER NULL,
    `targetWeightKg` DECIMAL(5, 2) NULL,
    `currentWeightKg` DECIMAL(5, 2) NULL,
    `privacyAgreedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_openid_key`(`openid`),
    UNIQUE INDEX `users_unionid_key`(`unionid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pk_rooms` (
    `id` VARCHAR(191) NOT NULL,
    `inviteCode` VARCHAR(12) NOT NULL,
    `name` VARCHAR(20) NOT NULL,
    `status` ENUM('pending', 'active', 'ended', 'dissolved') NOT NULL DEFAULT 'pending',
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `durationDays` INTEGER NOT NULL,
    `maxMembers` INTEGER NOT NULL DEFAULT 5,
    `creatorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pk_rooms_inviteCode_key`(`inviteCode`),
    INDEX `pk_rooms_creatorId_createdAt_idx`(`creatorId`, `createdAt`),
    INDEX `pk_rooms_status_startDate_idx`(`status`, `startDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_members` (
    `roomId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `initialWeightKg` DECIMAL(5, 2) NOT NULL,
    `initialPhotoUrl` VARCHAR(500) NOT NULL,
    `currentWeightKg` DECIMAL(5, 2) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('active', 'withdrawn') NOT NULL DEFAULT 'active',

    INDEX `room_members_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`roomId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `checkins` (
    `id` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `checkinDate` DATE NOT NULL,
    `weightKg` DECIMAL(5, 2) NULL,
    `weightPhotoUrl` VARCHAR(500) NULL,
    `dietText` VARCHAR(200) NULL,
    `dietPhotoUrls` JSON NOT NULL,
    `exerciseText` VARCHAR(200) NULL,
    `exercisePhotoUrls` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `checkins_userId_checkinDate_idx`(`userId`, `checkinDate`),
    INDEX `checkins_roomId_checkinDate_idx`(`roomId`, `checkinDate`),
    UNIQUE INDEX `checkins_roomId_userId_checkinDate_key`(`roomId`, `userId`, `checkinDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fund_ledger` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `bizType` ENUM('deposit', 'refund', 'reward', 'penalty', 'adjust') NOT NULL,
    `bizId` VARCHAR(191) NOT NULL,
    `amountCent` INTEGER NOT NULL,
    `balanceCent` INTEGER NOT NULL,
    `remark` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fund_ledger_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `fund_ledger_bizType_bizId_idx`(`bizType`, `bizId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pk_rooms` ADD CONSTRAINT `pk_rooms_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_members` ADD CONSTRAINT `room_members_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `pk_rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_members` ADD CONSTRAINT `room_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checkins` ADD CONSTRAINT `checkins_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `pk_rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checkins` ADD CONSTRAINT `checkins_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
