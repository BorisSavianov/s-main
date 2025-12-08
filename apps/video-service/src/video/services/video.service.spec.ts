// apps/video-service/src/video/services/video.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { VideoService } from './video.service';
import { VideoRoom } from '../entities/video-room.entity';
import { VideoParticipant } from '../entities/video-participant.entity';
import { VideoSession } from '../entities/video-session.entity';
import { VideoGateway } from '../gateways/video.gateway';
import { SchedulingIntegrationService } from './scheduling-integration.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('VideoService', () => {
  let service: VideoService;
  let roomRepository: jest.Mocked<Repository<VideoRoom>>;
  let participantRepository: jest.Mocked<Repository<VideoParticipant>>;
  let sessionRepository: jest.Mocked<Repository<VideoSession>>;
  let videoGateway: jest.Mocked<VideoGateway>;
  let schedulingIntegration: jest.Mocked<SchedulingIntegrationService>;

  const mockRoom: Partial<VideoRoom> = {
    id: 'room-uuid-1',
    roomId: 'room_123456789',
    meetingId: 'meeting-uuid-1',
    hostUserId: 'user-uuid-1',
    accessCode: 'ABC123',
    moderatorCode: 'MOD456',
    maxParticipants: 2,
    status: 'waiting',
    roomSettings: {
      audioEnabled: true,
      videoEnabled: true,
      screenShareEnabled: true,
      chatEnabled: true,
      waitingRoomEnabled: false,
      muteOnEntry: false,
    },
    participants: [],
  };

  const mockParticipant: Partial<VideoParticipant> = {
    id: 'participant-uuid-1',
    roomId: 'room_123456789',
    userId: 'user-uuid-2',
    displayName: 'Test User',
    role: 'participant',
    status: 'connected',
    mediaState: { video: true, audio: true, screenShare: false, speaking: false, dominantSpeaker: false },
    deviceCapabilities: { video: true, audio: true, screenShare: false, recording: false },
  };

  beforeEach(async () => {
    const mockRoomRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockParticipantRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    const mockSessionRepository = {
      save: jest.fn(),
    };

    const mockVideoGateway = {
      notifyParticipantJoined: jest.fn(),
      notifyParticipantLeft: jest.fn(),
      notifyRoomEnded: jest.fn(),
      notifyMediaStateChanged: jest.fn(),
      forwardSignalingData: jest.fn(),
    };

    const mockSchedulingIntegration = {
      validateMeetingAccess: jest.fn(),
      updateMeetingWithRoomDetails: jest.fn(),
      updateMeetingStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoService,
        {
          provide: getRepositoryToken(VideoRoom),
          useValue: mockRoomRepository,
        },
        {
          provide: getRepositoryToken(VideoParticipant),
          useValue: mockParticipantRepository,
        },
        {
          provide: getRepositoryToken(VideoSession),
          useValue: mockSessionRepository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                VIDEO_SERVICE_URL: 'http://localhost:4005',
              };
              return config[key] || defaultValue;
            }),
          },
        },
        {
          provide: VideoGateway,
          useValue: mockVideoGateway,
        },
        {
          provide: SchedulingIntegrationService,
          useValue: mockSchedulingIntegration,
        },
      ],
    }).compile();

    service = module.get<VideoService>(VideoService);
    roomRepository = module.get(getRepositoryToken(VideoRoom));
    participantRepository = module.get(getRepositoryToken(VideoParticipant));
    sessionRepository = module.get(getRepositoryToken(VideoSession));
    videoGateway = module.get(VideoGateway);
    schedulingIntegration = module.get(SchedulingIntegrationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRoom', () => {
    it('should create a room successfully', async () => {
      const createRoomDto = {
        meetingId: 'meeting-uuid-1',
        maxParticipants: 2,
        isRecordingEnabled: false,
      };

      schedulingIntegration.validateMeetingAccess.mockResolvedValue({
        id: 'meeting-uuid-1',
        counselorId: 'user-uuid-1',
        clientId: 'user-uuid-2',
      } as any);

      roomRepository.create.mockReturnValue(mockRoom as VideoRoom);
      roomRepository.save.mockResolvedValue(mockRoom as VideoRoom);
      schedulingIntegration.updateMeetingWithRoomDetails.mockResolvedValue();

      const result = await service.createRoom(createRoomDto, 'user-uuid-1');

      expect(result).toEqual(mockRoom);
      expect(roomRepository.create).toHaveBeenCalled();
      expect(roomRepository.save).toHaveBeenCalled();
      expect(schedulingIntegration.updateMeetingWithRoomDetails).toHaveBeenCalled();
    });

    it('should throw BadRequestException if meeting access denied', async () => {
      const createRoomDto = {
        meetingId: 'meeting-uuid-1',
      };

      schedulingIntegration.validateMeetingAccess.mockResolvedValue(null);

      await expect(
        service.createRoom(createRoomDto, 'unauthorized-user')
      ).rejects.toThrow(BadRequestException);
    });

    it('should create room without meeting ID', async () => {
      const createRoomDto = {};

      roomRepository.create.mockReturnValue({ ...mockRoom, meetingId: null } as unknown as VideoRoom);
      roomRepository.save.mockResolvedValue({ ...mockRoom, meetingId: null } as unknown as VideoRoom);

      const result = await service.createRoom(createRoomDto, 'user-uuid-1');

      expect(result).toBeDefined();
      expect(schedulingIntegration.validateMeetingAccess).not.toHaveBeenCalled();
    });
  });

  describe('joinRoom', () => {
    it('should join room successfully with access code', async () => {
      const joinRoomDto = {
        displayName: 'Test User',
        accessCode: 'ABC123',
        deviceCapabilities: { video: true, audio: true },
      };

      roomRepository.findOne.mockResolvedValue({ ...mockRoom, participants: [] } as VideoRoom);
      participantRepository.findOne.mockResolvedValue(null);
      participantRepository.create.mockReturnValue(mockParticipant as VideoParticipant);
      participantRepository.save.mockResolvedValue(mockParticipant as VideoParticipant);
      roomRepository.save.mockResolvedValue({ ...mockRoom, status: 'active' } as VideoRoom);

      const result = await service.joinRoom('room_123456789', joinRoomDto, 'user-uuid-2');

      expect(result.room).toBeDefined();
      expect(result.participant).toBeDefined();
      expect(result.rtcConfiguration).toBeDefined();
      expect(result.sessionToken).toBeDefined();
    });

    it('should throw NotFoundException if room does not exist', async () => {
      roomRepository.findOne.mockResolvedValue(null);

      await expect(
        service.joinRoom('nonexistent-room', {}, 'user-uuid-1')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if room has ended', async () => {
      roomRepository.findOne.mockResolvedValue({ ...mockRoom, status: 'ended' } as VideoRoom);

      await expect(
        service.joinRoom('room_123456789', {}, 'user-uuid-1')
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if room is full', async () => {
      const fullRoom = {
        ...mockRoom,
        maxParticipants: 2,
        participants: [
          { ...mockParticipant, status: 'connected' },
          { ...mockParticipant, id: 'p2', userId: 'u2', status: 'connected' },
        ],
      };

      roomRepository.findOne.mockResolvedValue(fullRoom as VideoRoom);

      await expect(
        service.joinRoom('room_123456789', { accessCode: 'ABC123' }, 'new-user')
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow moderator to join full room', async () => {
      const fullRoom = {
        ...mockRoom,
        maxParticipants: 2,
        participants: [
          { ...mockParticipant, status: 'connected' },
          { ...mockParticipant, id: 'p2', userId: 'u2', status: 'connected' },
        ],
      };

      roomRepository.findOne.mockResolvedValue(fullRoom as VideoRoom);
      participantRepository.findOne.mockResolvedValue(null);
      participantRepository.create.mockReturnValue({ ...mockParticipant, role: 'moderator' } as VideoParticipant);
      participantRepository.save.mockResolvedValue({ ...mockParticipant, role: 'moderator' } as VideoParticipant);

      const result = await service.joinRoom(
        'room_123456789',
        { accessCode: 'MOD456', displayName: 'Moderator' },
        'moderator-user'
      );

      expect(result.participant.role).toBe('moderator');
    });
  });

  describe('leaveRoom', () => {
    it('should leave room successfully', async () => {
      participantRepository.findOne.mockResolvedValue(mockParticipant as VideoParticipant);
      participantRepository.save.mockResolvedValue({
        ...mockParticipant,
        status: 'disconnected',
        leftAt: new Date(),
      } as VideoParticipant);

      roomRepository.findOne.mockResolvedValue({
        ...mockRoom,
        participants: [{ ...mockParticipant, status: 'disconnected' }],
      } as VideoRoom);

      await service.leaveRoom('room_123456789', 'user-uuid-2');

      expect(participantRepository.save).toHaveBeenCalled();
    });

    it('should do nothing if participant not in room', async () => {
      participantRepository.findOne.mockResolvedValue(null);

      await service.leaveRoom('room_123456789', 'nonexistent-user');

      expect(participantRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getRoomDetails', () => {
    it('should return room details for authorized user', async () => {
      roomRepository.findOne.mockResolvedValue({
        ...mockRoom,
        participants: [mockParticipant],
      } as VideoRoom);

      const result = await service.getRoomDetails('room_123456789', 'user-uuid-1');

      expect(result).toBeDefined();
      expect(result.roomId).toBe('room_123456789');
    });

    it('should throw NotFoundException for nonexistent room', async () => {
      roomRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getRoomDetails('nonexistent', 'user-uuid-1')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateParticipantMedia', () => {
    it('should update media state successfully', async () => {
      participantRepository.findOne.mockResolvedValue(mockParticipant as VideoParticipant);
      participantRepository.save.mockResolvedValue({
        ...mockParticipant,
        mediaState: { ...mockParticipant.mediaState, video: false },
      } as VideoParticipant);

      await service.updateParticipantMedia('room_123456789', 'user-uuid-2', { video: false });

      expect(participantRepository.save).toHaveBeenCalled();
      expect(videoGateway.notifyMediaStateChanged).toHaveBeenCalled();
    });

    it('should throw NotFoundException for nonexistent participant', async () => {
      participantRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateParticipantMedia('room_123456789', 'nonexistent', { video: false })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRoomStats', () => {
    it('should return room statistics', async () => {
      const activeRoom = {
        ...mockRoom,
        status: 'active',
        startedAt: new Date(Date.now() - 60000), // 1 minute ago
        participants: [{ ...mockParticipant, status: 'connected' }],
      };

      roomRepository.findOne.mockResolvedValue(activeRoom as VideoRoom);

      const stats = await service.getRoomStats('room_123456789');

      expect(stats.participantCount).toBe(1);
      expect(stats.sessionDuration).toBeGreaterThan(0);
      expect(stats.connectionQuality).toBe('good');
    });
  });
});
