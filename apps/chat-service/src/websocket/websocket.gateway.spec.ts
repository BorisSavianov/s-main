import { Test, TestingModule } from '@nestjs/testing';
import { WebSocketGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { ConnectionManager } from './connection.manager';
import { JwtService } from '@nestjs/jwt';
import { EnhancedAIService } from '../ai/web-ai.service';
import { PreferencesService } from 'apps/user-service/src/preferences/preferences.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatMessage, SenderType } from '../chat/entities/chat-message.entity';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';
import { WsAuthGuard } from './guards/ws-auth.guard';
import { WsThrottleGuard } from './guards/ws-throttle.guard';

describe('WebSocketGateway', () => {
  let gateway: WebSocketGateway;
  let websocketService: any;
  let connectionManager: any;
  let jwtService: any;
  let webAiService: any;
  let preferencesService: any;
  let chatMessageRepository: any;

  const mockWebSocketService = {
    setServer: jest.fn(),
    validateSessionAccess: jest.fn(),
    getSessionInfo: jest.fn(),
    getRecentMessages: jest.fn(),
    createMessage: jest.fn(),
    markMessagesAsRead: jest.fn(),
  };

  const mockConnectionManager = {
    addConnection: jest.fn(),
    removeConnection: jest.fn(),
    addToSession: jest.fn(),
    removeFromSession: jest.fn(),
    getUserId: jest.fn(),
    isInSession: jest.fn(),
    updateTypingStatus: jest.fn(),
  };

  const mockJwtService = {
    verify: jest.fn(),
  };

  const mockWebAiService = {
    generateResponseWithSearch: jest.fn(),
  };

  const mockPreferencesService = {
    isWebSearchEnabled: jest.fn(),
  };

  const mockChatMessageRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockSocket = {
    id: 'socket-1',
    handshake: { auth: { token: 'token' } },
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    to: jest.fn().mockReturnThis(),
    disconnect: jest.fn(),
  } as unknown as Socket;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSocketGateway,
        { provide: WebSocketService, useValue: mockWebSocketService },
        { provide: ConnectionManager, useValue: mockConnectionManager },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EnhancedAIService, useValue: mockWebAiService },
        { provide: PreferencesService, useValue: mockPreferencesService },
        { provide: getRepositoryToken(ChatMessage), useValue: mockChatMessageRepository },
      ],
    })
    .overrideGuard(WsAuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(WsThrottleGuard)
    .useValue({ canActivate: () => true })
    .compile();

    gateway = module.get<WebSocketGateway>(WebSocketGateway);
    websocketService = module.get(WebSocketService);
    connectionManager = module.get(ConnectionManager);
    jwtService = module.get(JwtService);
    webAiService = module.get(EnhancedAIService);
    preferencesService = module.get(PreferencesService);
    chatMessageRepository = module.get(getRepositoryToken(ChatMessage));

    // Mock logger
    (gateway as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // Mock server
    (gateway as any).server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should handle connection successfully', async () => {
      mockJwtService.verify.mockReturnValue({ id: 'user-1' });
      await gateway.handleConnection(mockSocket);
      expect(mockConnectionManager.addConnection).toHaveBeenCalledWith(mockSocket, { id: 'user-1' });
    });

    it('should handle connection failure', async () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('Invalid token'); });
      await gateway.handleConnection(mockSocket);
      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.any(Object));
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleJoinSession', () => {
    it('should join session successfully', async () => {
      const data = { sessionId: 'session-1', userId: 'user-1' };
      mockWebSocketService.validateSessionAccess.mockResolvedValue(true);
      mockWebSocketService.getSessionInfo.mockResolvedValue({});
      mockWebSocketService.getRecentMessages.mockResolvedValue([]);
      mockConnectionManager.getUserId.mockResolvedValue('user-1');

      await gateway.handleJoinSession(mockSocket, data);

      expect(mockSocket.join).toHaveBeenCalledWith('session-1');
      expect(mockSocket.emit).toHaveBeenCalledWith('sessionJoined', expect.objectContaining({ success: true }));
    });

    it('should reject join if access denied', async () => {
      const data = { sessionId: 'session-1', userId: 'user-1' };
      mockWebSocketService.validateSessionAccess.mockResolvedValue(false);

      await gateway.handleJoinSession(mockSocket, data);

      expect(mockSocket.emit).toHaveBeenCalledWith('sessionJoined', expect.objectContaining({ success: false }));
    });
  });

  describe('handleSendMessage', () => {
    it('should send message successfully', async () => {
      const data = { sessionId: 'session-1', content: 'hello' };
      mockConnectionManager.getUserId.mockResolvedValue('user-1');
      mockConnectionManager.isInSession.mockResolvedValue(true);
      mockWebSocketService.createMessage.mockResolvedValue({ id: 'msg-1', content: 'hello' });

      await gateway.handleSendMessage(mockSocket, data);

      expect(mockWebSocketService.createMessage).toHaveBeenCalled();
      expect((gateway as any).server.to).toHaveBeenCalledWith('session-1');
      expect(mockSocket.emit).toHaveBeenCalledWith('messageStatus', expect.objectContaining({ status: 'delivered' }));
    });

    it('should fail if not in session', async () => {
      const data = { sessionId: 'session-1', content: 'hello' };
      mockConnectionManager.isInSession.mockResolvedValue(false);

      await gateway.handleSendMessage(mockSocket, data);

      expect(mockSocket.emit).toHaveBeenCalledWith('messageStatus', expect.objectContaining({ status: 'failed' }));
    });
  });

  describe('handleRequestAI', () => {
    it('should handle AI request', async () => {
      const data = { sessionId: 'session-1', message: 'help', userId: 'user-1' };
      mockConnectionManager.isInSession.mockResolvedValue(true);
      mockPreferencesService.isWebSearchEnabled.mockResolvedValue(false);
      mockWebAiService.generateResponseWithSearch.mockResolvedValue({ content: 'AI response' });
      mockWebSocketService.createMessage.mockResolvedValue({ id: 'ai-msg', content: 'AI response' });

      await gateway.handleRequestAI(mockSocket, data);

      expect(mockWebAiService.generateResponseWithSearch).toHaveBeenCalled();
      expect((gateway as any).server.to).toHaveBeenCalledWith('session-1');
    });
  });
});
