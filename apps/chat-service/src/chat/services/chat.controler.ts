// apps/chat-service/src/chat/controllers/chat.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { ChatService } from '../services/chat.service';
import { CreateSessionDto } from '../dto/create-session.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { QueryMessagesDto } from '../dto/query-messages.dto';
import { EndSessionDto } from '../dto/end-session.dto';
import { UpdateMessageDto } from '../dto/update-message.dto';
import { SessionResponseDto } from '../dto/session-response.dto';
import { MessageResponseDto } from '../dto/message-response.dto';
import { JwtAuthGuard } from '../../../../auth-service/src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../auth-service/src/auth/guards/roles.guard';
import { Roles } from '../../../../auth-service/src/auth/decorators/roles.decorator';
import { GetUser } from '../../../../auth-service/src/auth/decorators/get-user.decorator';
import { UserRole } from '../../auth/enums/user-role.enum';

@ApiTags('Chat')
@Controller('api/v1/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Create a new chat session' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Session created successfully',
    type: SessionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid session data',
  })
  async createSession(
    @Body(ValidationPipe) createSessionDto: CreateSessionDto,
  ): Promise<SessionResponseDto> {
    const session = await this.chatService.createSession(createSessionDto);
    return this.mapToSessionResponse(session);
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: 'Get session details' })
  @ApiParam({ name: 'sessionId', description: 'Session ID or token' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Session details retrieved successfully',
    type: SessionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Session not found',
  })
  async getSession(
    @Param('sessionId') sessionId: string,
  ): Promise<SessionResponseDto> {
    const session = await this.chatService.getSession(sessionId);
    return this.mapToSessionResponse(session);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send a message in a chat session' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Message sent successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid message data',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Session not found',
  })
  async sendMessage(
    @Body(ValidationPipe) sendMessageDto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    const message = await this.chatService.sendMessage(sendMessageDto);
    return this.mapToMessageResponse(message);
  }

  @Get('messages')
  @ApiOperation({ summary: 'Get messages with filtering and pagination' })
  @ApiQuery({
    name: 'sessionId',
    required: false,
    description: 'Filter by session ID',
  })
  @ApiQuery({
    name: 'senderId',
    required: false,
    description: 'Filter by sender ID',
  })
  @ApiQuery({
    name: 'senderType',
    required: false,
    description: 'Filter by sender type',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    description: 'Filter messages from date',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    description: 'Filter messages to date',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({
    name: 'flaggedOnly',
    required: false,
    description: 'Show only flagged messages',
  })
  async getMessages(@Query(ValidationPipe) queryDto: QueryMessagesDto) {
    const result = await this.chatService.getMessages(queryDto);
    return {
      ...result,
      data: result.data.map((message) => this.mapToMessageResponse(message)),
    };
  }

  @Patch('messages/:messageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COUNSELOR, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a message (counselors/admins only)' })
  @ApiParam({ name: 'messageId', description: 'Message ID to update' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Message updated successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Message not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async updateMessage(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body(ValidationPipe) updateDto: UpdateMessageDto,
  ): Promise<MessageResponseDto> {
    const message = await this.chatService.updateMessage(messageId, updateDto);
    return this.mapToMessageResponse(message);
  }

  @Post('sessions/:sessionId/end')
  @ApiOperation({ summary: 'End a chat session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID to end' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Session ended successfully',
    type: SessionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Session not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Session already ended',
  })
  @HttpCode(HttpStatus.OK)
  async endSession(
    @Param('sessionId') sessionId: string,
    @Body(ValidationPipe) endSessionDto: EndSessionDto,
  ): Promise<SessionResponseDto> {
    // Override sessionId from param
    endSessionDto.sessionId = sessionId;
    const session = await this.chatService.endSession(endSessionDto);
    return this.mapToSessionResponse(session);
  }

  @Get('users/:userId/sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user chat sessions' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of sessions to return',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of sessions to skip',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User sessions retrieved successfully',
    type: [SessionResponseDto],
  })
  async getUserSessions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
    @GetUser() currentUser: any,
  ): Promise<SessionResponseDto[]> {
    // Users can only access their own sessions, unless they're counselors/admins
    if (
      currentUser.id !== userId &&
      ![UserRole.COUNSELOR, UserRole.ADMIN].includes(currentUser.role)
    ) {
      throw new Error('Unauthorized to access these sessions');
    }

    const sessions = await this.chatService.getUserSessions(
      userId,
      Number(limit),
      Number(offset),
    );
    return sessions.map((session) => this.mapToSessionResponse(session));
  }

  @Get('sessions/:sessionId/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COUNSELOR, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get session statistics (counselors/admins only)' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Session statistics retrieved successfully',
  })
  async getSessionStats(@Param('sessionId') sessionId: string) {
    return this.chatService.getSessionStats(sessionId);
  }

  @Get('search/messages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COUNSELOR, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Search messages semantically (counselors/admins only)',
  })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({
    name: 'sessionId',
    required: false,
    description: 'Limit search to session',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of results',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Search results retrieved successfully',
  })
  async searchMessages(
    @Query('q') query: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit') limit = 10,
  ) {
    const result = await this.chatService.searchMessages(
      query,
      sessionId,
      Number(limit),
    );
    return {
      ...result,
      results: result.results.map((message) =>
        this.mapToMessageResponse(message),
      ),
    };
  }

  // Helper methods for response mapping
  private mapToSessionResponse(session: any): SessionResponseDto {
    return {
      id: session.id,
      userId: session.userId,
      counselorId: session.counselorId,
      sessionToken: session.sessionToken,
      isAnonymous: session.isAnonymous,
      isActive: session.isActive,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      summary: session.summary,
      overallSentiment: session.overallSentiment,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: session.messages?.slice(0, 5), // Only include recent messages
    };
  }

  private mapToMessageResponse(message: any): MessageResponseDto {
    return {
      id: message.id,
      sessionId: message.sessionId,
      senderId: message.senderId,
      senderType: message.senderType,
      content: message.content,
      contentType: message.contentType,
      sentimentScore: message.sentimentScore,
      isFlagged: message.isFlagged,
      flagReason: message.flagReason,
      createdAt: message.createdAt,
      attachments: message.attachments,
    };
  }
}
