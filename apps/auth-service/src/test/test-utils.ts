// Test utilities and common mocks

import { User, UserRole } from '../database/entities/user.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { CounselorProfile } from '../database/entities/counselor-profile.entity';
import { OAuthProvider } from '../database/entities/oauth-provider.entity';

export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  passwordHash: 'hashedPassword',
  firstName: 'John',
  lastName: 'Doe',
  role: UserRole.USER,
  isActive: true,
  isVerified: true,
  timezone: 'UTC',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  sessions: [],
  oauthProviders: [],
  counselorProfile: undefined,
  ...overrides,
});

export const createMockCounselorUser = (overrides: Partial<User> = {}): User =>
  createMockUser({
    role: UserRole.COUNSELOR,
    ...overrides,
  });

export const createMockAdminUser = (overrides: Partial<User> = {}): User =>
  createMockUser({
    role: UserRole.ADMIN,
    ...overrides,
  });

export const createMockUserSession = (
  overrides: Partial<UserSession> = {},
): UserSession => ({
  id: 'session-123',
  userId: '123e4567-e89b-12d3-a456-426614174000',
  sessionToken: 'session-token-123',
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  isActive: true,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
  createdAt: new Date(),
  updatedAt: new Date(),
  user: createMockUser(),
  ...overrides,
});

export const createMockCounselorProfile = (
  overrides: Partial<CounselorProfile> = {},
): CounselorProfile => ({
  id: '456e7890-e89b-12d3-a456-426614174001',
  userId: '123e4567-e89b-12d3-a456-426614174000',
  licenseNumber: 'LIC123456',
  specialties: ['Anxiety', 'Depression'],
  bio: 'Experienced counselor specializing in anxiety and depression',
  hourlyRate: 100,
  isAvailable: true,
  rating: 4.5,
  totalReviews: 10,
  experienceYears: 5,
  qualifications: ['PhD in Psychology', 'Certified Counselor'],
  languages: ['English', 'Spanish'],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  user: createMockCounselorUser(),
  ...overrides,
});

export const createMockOAuthProvider = (
  overrides: Partial<OAuthProvider> = {},
): OAuthProvider => ({
  id: '789e0123-e89b-12d3-a456-426614174002',
  userId: '123e4567-e89b-12d3-a456-426614174000',
  provider: 'google',
  providerId: 'google-user-123',
  accessToken: 'oauth-access-token',
  refreshToken: 'oauth-refresh-token',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
  createdAt: new Date(),
  updatedAt: new Date(),
  user: createMockUser(),
  ...overrides,
});

export const createMockJwtPayload = (overrides: any = {}) => ({
  sub: '123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  role: UserRole.USER,
  sessionId: 'session-123',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  ...overrides,
});

export const createMockRequest = (overrides: any = {}) => ({
  headers: {
    'x-forwarded-for': '192.168.1.1',
    'user-agent': 'Mozilla/5.0',
    authorization: 'Bearer mock-token',
    ...overrides.headers,
  },
  connection: {
    remoteAddress: '127.0.0.1',
  },
  socket: {
    remoteAddress: '127.0.0.1',
  },
  cookies: {},
  get: jest.fn().mockReturnValue('Mozilla/5.0'),
  ip: '127.0.0.1',
  ...overrides,
});

export const createMockOAuthProfile = (
  provider: string = 'google',
  overrides: any = {},
) => ({
  id: `${provider}-user-123`,
  emails: [{ value: 'test@example.com', verified: true }],
  name: {
    givenName: 'John',
    familyName: 'Doe',
  },
  displayName: 'John Doe',
  provider,
  _json: {
    sub: `${provider}-user-123`,
    email: 'test@example.com',
    email_verified: true,
    given_name: 'John',
    family_name: 'Doe',
    name: 'John Doe',
  },
  ...overrides,
});

// Common test constants
export const TEST_CONSTANTS = {
  VALID_EMAIL: 'test@example.com',
  INVALID_EMAIL: 'invalid-email',
  VALID_PASSWORD: 'SecurePassword123!',
  WEAK_PASSWORD: '123',
  VALID_UUID: '123e4567-e89b-12d3-a456-426614174000',
  INVALID_UUID: 'invalid-uuid',
  VALID_TOKEN: 'valid-token-123',
  INVALID_TOKEN: 'invalid-token',
  EXPIRED_TOKEN: 'expired-token',
  TEST_IP: '127.0.0.1',
  TEST_USER_AGENT: 'Mozilla/5.0 (Test)',
};

// Mock repository helper
export const createMockRepository = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  remove: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    getCount: jest.fn(),
  }),
});

// Mock service helper
export const createMockService = <T>(methods: Array<keyof T>) => {
  const mock: any = {};
  methods.forEach((method) => {
    mock[method] = jest.fn();
  });
  return mock as jest.Mocked<T>;
};
