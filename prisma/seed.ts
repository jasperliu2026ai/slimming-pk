import { Gender, MemberStatus, PrismaClient, RoomStatus } from '@prisma/client';

const prisma = new PrismaClient();

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

async function main() {
  const now = new Date();
  const users = [
    {
      id: 'demo-user-id',
      openid: 'local-demo-openid',
      nickname: '减肥达人',
      heightCm: 165,
      targetWeightKg: 55,
      currentWeightKg: 63.2,
    },
    {
      id: 'user-xiaolin',
      openid: 'local-xiaolin',
      nickname: '小林',
      heightCm: null,
      targetWeightKg: null,
      currentWeightKg: 69,
    },
    {
      id: 'user-mia',
      openid: 'local-mia',
      nickname: 'Mia',
      heightCm: null,
      targetWeightKg: null,
      currentWeightKg: 58,
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        ...user,
        avatarUrl: '',
        gender: Gender.unknown,
        privacyAgreedAt: now,
      },
    });
  }

  await prisma.pkRoom.upsert({
    where: { id: 'room-demo-001' },
    update: {},
    create: {
      id: 'room-demo-001',
      inviteCode: 'PK5872',
      name: '7 天轻盈挑战',
      status: RoomStatus.active,
      startDate: dateOnly('2026-07-08'),
      endDate: dateOnly('2026-07-14'),
      durationDays: 7,
      maxMembers: 5,
      creatorId: 'user-xiaolin',
    },
  });

  const memberships = [
    ['user-xiaolin', 72, 69, 'local://xiaolin'],
    ['user-mia', 60, 58, 'local://mia'],
    ['demo-user-id', 65, 63.2, 'local://demo'],
  ] as const;
  for (const [userId, initialWeightKg, currentWeightKg, initialPhotoKey] of memberships) {
    await prisma.roomMember.upsert({
      where: { roomId_userId: { roomId: 'room-demo-001', userId } },
      update: {},
      create: {
        roomId: 'room-demo-001',
        userId,
        initialWeightKg,
        currentWeightKg,
        initialPhotoKey,
        status: MemberStatus.active,
      },
    });
  }

  const daysByUser: Record<string, number> = {
    'user-xiaolin': 7,
    'user-mia': 7,
    'demo-user-id': 5,
  };
  const checkins = Object.entries(daysByUser).flatMap(([userId, days]) =>
    Array.from({ length: days }, (_, index) => ({
      id: `seed-${userId}-${index + 1}`,
      roomId: 'room-demo-001',
      userId,
      checkinDate: dateOnly(`2026-07-${String(8 + index).padStart(2, '0')}`),
      dietText: '完成今日健康打卡',
      dietPhotoUrls: [],
      exercisePhotoUrls: [],
    })),
  );
  await prisma.checkin.createMany({ data: checkins, skipDuplicates: true });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
