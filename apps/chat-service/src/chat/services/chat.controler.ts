// apps/chat-service/src/chat/services/chat.controller.ts
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
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiSecurity,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { ChatService } from './chat.service';
import { CreateSessionDto } from '../dto/create-session.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { QueryMessagesDto } from '../dto/query-messages.dto';
import { EndSessionDto } from '../dto/end-session.dto';
import { UpdateMessageDto } from '../dto/update-message.dto';
import { SessionResponseDto } from '../dto/session-response.dto';
import { MessageResponseDto } from '../dto/message-response.dto';

// Import guards from auth-service
import { JwtAuthGuard } from '../../../../auth-service/src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../auth-service/src/auth/guards/roles.guard';
import { LocalAuthGuard } from '../../../../auth-service/src/auth/guards/local-auth.guard';
import { RefreshTokenGuard } from '../../../../auth-service/src/auth/guards/refresh-token.guard';

// Import decorators
import { Roles } from '../../../../auth-service/src/auth/decorators/roles.decorator';
import { GetUser } from '../../../../auth-service/src/auth/decorators/get-user.decorator';
import { Public } from '../../../../auth-service/src/auth/decorators/public.decorator';
import { UserRole } from '../../../../auth-service/src/database/entities/user.entity';

@ApiTags('Chat')
@Controller('/chat')
@UseGuards(JwtAuthGuard) // Apply JWT guard globally to this controller
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('sessions')
  @Public() // Allow public access for anonymous sessions
  @UseGuards(ThrottlerGuard) // Rate limiting for session creation
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
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many session creation requests',
  })
  async createSession(
    @Body(ValidationPipe) createSessionDto: CreateSessionDto,
  ): Promise<SessionResponseDto> {
    const session = await this.chatService.createSession(createSessionDto);
    return this.mapToSessionResponse(session);
  }

  @Get('sessions/:sessionId')
  @Public() // Allow public access for anonymous sessions
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
  @Public() // Allow public message sending for anonymous sessions
  @UseGuards(ThrottlerGuard) // Rate limiting for message sending
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
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded',
  })
  async sendMessage(
    @Body(ValidationPipe) sendMessageDto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    const message = await this.chatService.sendMessage(sendMessageDto);
    return this.mapToMessageResponse(message);
  }

  @Get('messages')
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER, UserRole.COUNSELOR, UserRole.ADMIN)
  @ApiBearerAuth()
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
  async getMessages(
    @Query(ValidationPipe) queryDto: QueryMessagesDto,
    @GetUser() currentUser: any,
  ) {
    // Users can only see messages from their own sessions
    if (
      currentUser.role === UserRole.USER &&
      queryDto.senderId &&
      queryDto.senderId !== currentUser.id
    ) {
      throw new ForbiddenException('Cannot access messages from other users');
    }

    const result = await this.chatService.getMessages(queryDto);
    return {
      ...result,
      data: result.data.map((message) => this.mapToMessageResponse(message)),
    };
  }

  @Patch('messages/:messageId')
  @UseGuards(RolesGuard)
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
    @GetUser() currentUser: any,
  ): Promise<MessageResponseDto> {
    const message = await this.chatService.updateMessage(messageId, updateDto);
    return this.mapToMessageResponse(message);
  }

  @Post('sessions/:sessionId/end')
  @Public() // Allow public session ending for anonymous sessions
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER, UserRole.COUNSELOR, UserRole.ADMIN)
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
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied to user sessions',
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
      throw new ForbiddenException('Unauthorized to access these sessions');
    }

    const sessions = await this.chatService.getUserSessions(
      userId,
      Number(limit),
      Number(offset),
    );
    return sessions.map((session) => this.mapToSessionResponse(session));
  }

  @Get('sessions/:sessionId/stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COUNSELOR, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get session statistics (counselors/admins only)' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Session statistics retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  async getSessionStats(
    @Param('sessionId') sessionId: string,
    @GetUser() currentUser: any,
  ) {
    return this.chatService.getSessionStats(sessionId);
  }

  @Get('search/messages')
  @UseGuards(RolesGuard, ThrottlerGuard)
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
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient permissions',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Search rate limit exceeded',
  })
  async searchMessages(
    @Query('q') query: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit') limit = 10,
    @GetUser() currentUser?: any,
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

  // // Admin-only endpoints
  // @Get('admin/flagged-messages')
  // @UseGuards(RolesGuard)
  // @Roles(UserRole.ADMIN)
  // @ApiBearerAuth()
  // @ApiOperation({ summary: 'Get all flagged messages (admin only)' })
  // @ApiQuery({
  //   name: 'page',
  //   required: false,
  //   description: 'Page number',
  //   type: 'number',
  // })
  // @ApiQuery({
  //   name: 'limit',
  //   required: false,
  //   description: 'Items per page',
  //   type: 'number',
  // })
  // @ApiResponse({
  //   status: HttpStatus.OK,
  //   description: 'Flagged messages retrieved successfully',
  // })
  // @ApiResponse({
  //   status: HttpStatus.FORBIDDEN,
  //   description: 'Admin access required',
  // })
  // async getFlaggedMessages(
  //   @Query('page') page = 1,
  //   @Query('limit') limit = 20,
  //   @GetUser() currentUser: any,
  // ) {
  //   const queryDto: QueryMessagesDto = {
  //     flaggedOnly: true,
  //     page: Number(page),
  //     limit: Number(limit),
  //   };

  //   const result = await this.chatService.getMessages(queryDto);
  //   return {
  //     ...result,
  //     data: result.data.map((message) => this.mapToMessageResponse(message)),
  //   };
  // }

  // @Delete('admin/messages/:messageId')
  // @UseGuards(RolesGuard)
  // @Roles(UserRole.ADMIN)
  // @ApiBearerAuth()
  // @ApiOperation({ summary: 'Delete a message (admin only)' })
  // @ApiParam({ name: 'messageId', description: 'Message ID to delete' })
  // @ApiResponse({
  //   status: HttpStatus.NO_CONTENT,
  //   description: 'Message deleted successfully',
  // })
  // @ApiResponse({
  //   status: HttpStatus.NOT_FOUND,
  //   description: 'Message not found',
  // })
  // @ApiResponse({
  //   status: HttpStatus.FORBIDDEN,
  //   description: 'Admin access required',
  // })
  // @HttpCode(HttpStatus.NO_CONTENT)
  // async deleteMessage(
  //   @Param('messageId', ParseUUIDPipe) messageId: string,
  //   @GetUser() currentUser: any,
  // ): Promise<void> {
  //   await this.chatService.deleteMessage(messageId);
  // }

  // @Get('admin/sessions/analytics')
  // @UseGuards(RolesGuard, ThrottlerGuard)
  // @Roles(UserRole.ADMIN)
  // @ApiBearerAuth()
  // @ApiOperation({ summary: 'Get session analytics (admin only)' })
  // @ApiQuery({
  //   name: 'startDate',
  //   required: false,
  //   description: 'Start date for analytics',
  //   type: 'string',
  // })
  // @ApiQuery({
  //   name: 'endDate',
  //   required: false,
  //   description: 'End date for analytics',
  //   type: 'string',
  // })
  // @ApiResponse({
  //   status: HttpStatus.OK,
  //   description: 'Analytics data retrieved successfully',
  // })
  // @ApiResponse({
  //   status: HttpStatus.FORBIDDEN,
  //   description: 'Admin access required',
  // })
  // async getSessionAnalytics(
  //   @Query('startDate') startDate?: string,
  //   @Query('endDate') endDate?: string,
  //   @GetUser() currentUser?: any,
  // ) {
  //   return this.chatService.getSessionAnalytics(
  //     startDate ? new Date(startDate) : undefined,
  //     endDate ? new Date(endDate) : undefined,
  //   );
  // }

  // // Counselor-specific endpoints
  // @Get('counselor/assigned-sessions')
  // @UseGuards(RolesGuard)
  // @Roles(UserRole.COUNSELOR, UserRole.ADMIN)
  // @ApiBearerAuth()
  // @ApiOperation({ summary: 'Get counselor assigned sessions' })
  // @ApiQuery({
  //   name: 'status',
  //   required: false,
  //   description: 'Filter by session status',
  //   enum: ['active', 'ended'],
  // })
  // @ApiQuery({
  //   name: 'limit',
  //   required: false,
  //   description: 'Number of sessions to return',
  //   type: 'number',
  // })
  // @ApiResponse({
  //   status: HttpStatus.OK,
  //   description: 'Assigned sessions retrieved successfully',
  // })
  // @ApiResponse({
  //   status: HttpStatus.FORBIDDEN,
  //   description: 'Counselor access required',
  // })
  // async getCounselorSessions(
  //   @Query('status') status?: 'active' | 'ended',
  //   @Query('limit') limit = 20,
  //   @GetUser() currentUser: any,
  // ): Promise<SessionResponseDto[]> {
  //   const sessions = await this.chatService.getCounselorSessions(
  //     currentUser.id,
  //     status,
  //     Number(limit),
  //   );
  //   return sessions.map((session) => this.mapToSessionResponse(session));
  // }

  // @Post('counselor/assign/:sessionId')
  // @UseGuards(RolesGuard)
  // @Roles(UserRole.COUNSELOR, UserRole.ADMIN)
  // @ApiBearerAuth()
  // @ApiOperation({ summary: 'Assign counselor to session' })
  // @ApiParam({ name: 'sessionId', description: 'Session ID to assign to' })
  // @ApiResponse({
  //   status: HttpStatus.OK,
  //   description: 'Counselor assigned successfully',
  // })
  // @ApiResponse({
  //   status: HttpStatus.NOT_FOUND,
  //   description: 'Session not found',
  // })
  // @ApiResponse({
  //   status: HttpStatus.FORBIDDEN,
  //   description: 'Counselor access required',
  // })
  // @HttpCode(HttpStatus.OK)
  // async assignCounselor(
  //   @Param('sessionId') sessionId: string,
  //   @GetUser() currentUser: any,
  // ): Promise<SessionResponseDto> {
  //   const session = await this.chatService.assignCounselor(
  //     sessionId,
  //     currentUser.id,
  //   );
  //   return this.mapToSessionResponse(session);
  // }

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
