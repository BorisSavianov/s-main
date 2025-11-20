import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controler';
import { ChatService } from './chat.service';
import { CreateSessionDto, SessionType } from '../dto/create-session.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../../../auth-service/src/database/entities/user.entity';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../../auth-service/src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../auth-service/src/auth/guards/roles.guard';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: any;

  const mockChatService = {
    createSession: jest.fn(),
    getSession: jest.fn(),
    convertAnonymousSession: jest.fn(),
    sendMessage: jest.fn(),
    getMessages: jest.fn(),
    updateMessage: jest.fn(),
    endSession: jest.fn(),
    getUserSessions: jest.fn(),
    getSessionStats: jest.fn(),
    searchMessages: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: mockChatService,
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChatController>(ChatController);
    chatService = module.get(ChatService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createSession', () => {
    it('should create a session', async () => {
      const createSessionDto: CreateSessionDto = {
        sessionType: SessionType.ANONYMOUS,
      };
      const user = { id: 'user-1' };
      const session = { id: 'session-1', userId: 'user-1', isActive: true };

      mockChatService.createSession.mockResolvedValue(session);

      const result = await controller.createSession(createSessionDto, user);

      expect(result.id).toBe('session-1');
      expect(mockChatService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
      );
    });
  });

  describe('getSession', () => {
    it('should return session if user has access', async () => {
      const session = { id: 'session-1', userId: 'user-1', isActive: true };
      const user = { id: 'user-1' };

      mockChatService.getSession.mockResolvedValue(session);

      const result = await controller.getSession('session-1', user);

      expect(result.id).toBe('session-1');
    });

    it('should throw ForbiddenException if user has no access', async () => {
      const session = { id: 'session-1', userId: 'other-user', isActive: true };
      const user = { id: 'user-1' };

      mockChatService.getSession.mockResolvedValue(session);

      await expect(controller.getSession('session-1', user)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('sendMessage', () => {
    it('should send a message', async () => {
      const sendMessageDto: SendMessageDto = {
        sessionId: 'session-1',
        content: 'Hello',
        senderType: 'user' as any,
      };
      const user = { id: 'user-1' };
      const session = { id: 'session-1', userId: 'user-1', isActive: true };
      const message = { id: 'msg-1', ...sendMessageDto };

      mockChatService.getSession.mockResolvedValue(session);
      mockChatService.sendMessage.mockResolvedValue(message);

      const result = await controller.sendMessage(sendMessageDto, user);

      expect(result.id).toBe('msg-1');
      expect(mockChatService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ senderId: 'user-1' }),
      );
    });
  });

  describe('getUserSessions', () => {
    it('should return user sessions', async () => {
      const sessions = [{ id: 'session-1', userId: 'user-1' }];
      const user = { id: 'user-1', userId: 'user-1', role: UserRole.USER };

      mockChatService.getUserSessions.mockResolvedValue(sessions);

      const result = await controller.getUserSessions('user-1', 20, 0, user);

      expect(result).toHaveLength(1);
    });

    it('should throw ForbiddenException if accessing other user sessions', async () => {
      const user = { id: 'user-2', userId: 'user-2', role: UserRole.USER };

      await expect(controller.getUserSessions('user-1', 20, 0, user)).rejects.toThrow(ForbiddenException);
    });
  });
});
