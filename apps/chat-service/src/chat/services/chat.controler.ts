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
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Helper to verify session access
   * Returns true if user has access to the session
   */
  private canAccessSession(session: any, currentUser?: any): boolean {
    // Anonymous sessions can be accessed by anyone (not ideal for production)
    // Or check session token in headers/query
    if (session.isAnonymous && !session.userId) {
      return true;
    }

    // Authenticated sessions require matching userId
    if (session.userId && currentUser?.id) {
      return session.userId === currentUser.id;
    }

    // If session has userId but no current user, deny access
    // if (session.userId && !currentUser?.id) {
    //   return false;
    // }

    return true;
  }

  @Post('sessions')
  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Create a new chat session' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Session created successfully',
    type: SessionResponseDto,
  })
  async createSession(
    @Body(ValidationPipe) createSessionDto: CreateSessionDto,
    @GetUser() currentUser?: any,
  ): Promise<SessionResponseDto> {
    // If authenticated, use the authenticated user's ID
    if (currentUser?.id) {
      createSessionDto.userId = currentUser.id;
    }

    const session = await this.chatService.createSession(createSessionDto);
    return this.mapToSessionResponse(session);
  }

  @Get('sessions/:sessionId')
  @Public()
  @ApiOperation({ summary: 'Get session details' })
  async getSession(
    @Param('sessionId') sessionId: string,
    @GetUser() currentUser?: any,
  ): Promise<SessionResponseDto> {
    const session = await this.chatService.getSession(sessionId);

    // Verify access rights
    if (!this.canAccessSession(session, currentUser)) {
      throw new ForbiddenException('Access denied to this session');
    }

    return this.mapToSessionResponse(session);
  }

  @Patch('sessions/:sessionId')
  @Public()
  @ApiOperation({
    summary: 'Update session (e.g., convert anonymous to authenticated)',
  })
  async updateSession(
    @Param('sessionId') sessionId: string,
    @Body() updateData: { userId?: string },
    @GetUser() currentUser?: any,
  ): Promise<SessionResponseDto> {
    const session = await this.chatService.getSession(sessionId);

    // For anonymous session conversion, allow if user is authenticated
    if (session.isAnonymous && currentUser?.id) {
      // Only allow linking to the authenticated user's own account
      if (updateData.userId && updateData.userId !== currentUser.id) {
        throw new ForbiddenException('Can only link to your own account');
      }

      const updatedSession = await this.chatService.convertAnonymousSession(
        sessionId,
        currentUser.id,
      );

      return this.mapToSessionResponse(updatedSession);
    }

    // For non-anonymous sessions, require proper authorization
    if (!this.canAccessSession(session, currentUser)) {
      throw new ForbiddenException('Cannot modify this session');
    }

    throw new ForbiddenException('Cannot modify authenticated session');
  }

  @Post('messages')
  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Send a message in a chat session' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Message sent successfully',
    type: MessageResponseDto,
  })
  async sendMessage(
    @Body(ValidationPipe) sendMessageDto: SendMessageDto,
    @GetUser() currentUser?: any,
  ): Promise<MessageResponseDto> {
    // Verify session access
    const session = await this.chatService.getSession(sendMessageDto.sessionId);

    if (!this.canAccessSession(session, currentUser)) {
      throw new ForbiddenException('Access denied to this session');
    }

    // Set sender ID if authenticated
    if (currentUser?.id) {
      sendMessageDto.senderId = currentUser.id;
    }

    const message = await this.chatService.sendMessage(sendMessageDto);
    return this.mapToMessageResponse(message);
  }

  @Get('messages')
  @Public()
  @ApiOperation({ summary: 'Get messages with filtering and pagination' })
  async getMessages(
    @Query(ValidationPipe) queryDto: QueryMessagesDto,
    @GetUser() currentUser?: any,
  ) {
    // Verify session access if sessionId provided
    if (queryDto.sessionId) {
      const session = await this.chatService.getSession(queryDto.sessionId);

      if (!this.canAccessSession(session, currentUser)) {
        throw new ForbiddenException('Access denied to this session');
      }
    }

    // For authenticated users without sessionId, restrict to their own messages
    if (currentUser?.id && !queryDto.sessionId) {
      queryDto.senderId = currentUser.id;
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
  @Public()
  @ApiOperation({ summary: 'End a chat session' })
  @HttpCode(HttpStatus.OK)
  async endSession(
    @Param('sessionId') sessionId: string,
    @Body(ValidationPipe) endSessionDto: EndSessionDto,
    @GetUser() currentUser?: any,
  ): Promise<SessionResponseDto> {
    // Verify session access
    const session = await this.chatService.getSession(sessionId);

    if (!this.canAccessSession(session, currentUser)) {
      throw new ForbiddenException('Access denied to this session');
    }

    endSessionDto.sessionId = sessionId;
    const endedSession = await this.chatService.endSession(endSessionDto);
    return this.mapToSessionResponse(endedSession);
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
    @GetUser() currentUser?: any,
  ): Promise<SessionResponseDto[]> {
    // Users can only access their own sessions unless admin/counselor
    const isAdmin = currentUser?.role === UserRole.ADMIN;
    const isCounselor = currentUser?.role === UserRole.COUNSELOR;

    if (!isAdmin && !isCounselor && currentUser?.userId !== userId) {
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
      messages: session.messages?.slice(0, 5),
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
