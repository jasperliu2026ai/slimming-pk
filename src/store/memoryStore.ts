export type RoomStatus = 'pending' | 'active' | 'ended' | 'dissolved';

export interface StoredUser {
  id: string;
  openid: string;
  nickname: string;
  avatarUrl: string;
  gender: 'male' | 'female' | 'unknown';
  heightCm: number | null;
  targetWeightKg: number | null;
  currentWeightKg: number | null;
  privacyAgreedAt: string | null;
  createdAt: string;
}

export interface StoredRoom {
  id: string;
  inviteCode: string;
  name: string;
  status: RoomStatus;
  startDate: string;
  endDate: string;
  durationDays: number;
  creatorId: string;
  creatorNickname: string;
  createdAt: string;
}

export interface StoredMember {
  roomId: string;
  userId: string;
  nickname: string;
  avatarUrl: string;
  initialWeightKg: number;
  initialPhotoUrl: string;
  currentWeightKg: number;
  checkinDays: number;
  joinedAt: string;
  status: 'active' | 'withdrawn';
}

export interface StoredCheckin {
  id: string;
  userId: string;
  roomId: string;
  date: string;
  weightKg?: number;
  weightPhotoUrl?: string;
  dietText?: string;
  dietPhotoUrls: string[];
  exerciseText?: string;
  exercisePhotoUrls: string[];
  createdAt: string;
  updatedAt: string;
}

const now = new Date().toISOString();

export const users = new Map<string, StoredUser>([
  [
    'demo-user-id',
    {
      id: 'demo-user-id',
      openid: 'local-demo-openid',
      nickname: '减肥达人',
      avatarUrl: '',
      gender: 'unknown',
      heightCm: 165,
      targetWeightKg: 55,
      currentWeightKg: 63.2,
      privacyAgreedAt: now,
      createdAt: now,
    },
  ],
  [
    'user-xiaolin',
    {
      id: 'user-xiaolin',
      openid: 'local-xiaolin',
      nickname: '小林',
      avatarUrl: '',
      gender: 'unknown',
      heightCm: null,
      targetWeightKg: null,
      currentWeightKg: null,
      privacyAgreedAt: now,
      createdAt: now,
    },
  ],
  [
    'user-mia',
    {
      id: 'user-mia',
      openid: 'local-mia',
      nickname: 'Mia',
      avatarUrl: '',
      gender: 'unknown',
      heightCm: null,
      targetWeightKg: null,
      currentWeightKg: null,
      privacyAgreedAt: now,
      createdAt: now,
    },
  ],
]);

export const rooms = new Map<string, StoredRoom>([
  [
    'room-demo-001',
    {
      id: 'room-demo-001',
      inviteCode: 'PK5872',
      name: '7 天轻盈挑战',
      status: 'active',
      startDate: '2026-07-08',
      endDate: '2026-07-14',
      durationDays: 7,
      creatorId: 'user-xiaolin',
      creatorNickname: '小林',
      createdAt: now,
    },
  ],
]);

export const members: StoredMember[] = [
  {
    roomId: 'room-demo-001',
    userId: 'user-xiaolin',
    nickname: '小林',
    avatarUrl: '',
    initialWeightKg: 72,
    initialPhotoUrl: 'local://xiaolin',
    currentWeightKg: 69,
    checkinDays: 7,
    joinedAt: now,
    status: 'active',
  },
  {
    roomId: 'room-demo-001',
    userId: 'user-mia',
    nickname: 'Mia',
    avatarUrl: '',
    initialWeightKg: 60,
    initialPhotoUrl: 'local://mia',
    currentWeightKg: 58,
    checkinDays: 7,
    joinedAt: now,
    status: 'active',
  },
  {
    roomId: 'room-demo-001',
    userId: 'demo-user-id',
    nickname: '减肥达人',
    avatarUrl: '',
    initialWeightKg: 65,
    initialPhotoUrl: 'local://demo',
    currentWeightKg: 63.2,
    checkinDays: 5,
    joinedAt: now,
    status: 'active',
  },
];

export const checkins: StoredCheckin[] = [];
