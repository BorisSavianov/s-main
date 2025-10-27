// apps/chat-service/src/websocket/processors/ai-response.processor.ts
import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiContext } from '../../ai/entities/ai-context.entity';
import { AIService } from '../../ai/ai.service';
import {
  ChatMessage,
  SenderType,
} from '../../chat/entities/chat-message.entity';
import { ChatSession } from '../../chat/entities/chat-session.entity';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatContext } from '../../ai/types/ai.types';

@Processor('ai-response')
@Injectable()
export class AIResponseProcessor {
  private readonly logger = new Logger(AIResponseProcessor.name);

  constructor(
    @InjectRepository(AiContext)
    private readonly contextRepository: Repository<AiContext>,
    private readonly aiService: AIService,
    @InjectRepository(ChatSession)
    private chatSessionRepository: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private chatMessageRepository: Repository<ChatMessage>,
    @InjectQueue('chat-processing')
    private chatQueue: Queue,
    private eventEmitter: EventEmitter2,
  ) {}

  @Process('generate-response')
  async handleGenerateResponse(job: Job<any>) {
    const { context, messageId } = job.data;
    const sessionId = context.sessionId;

    try {
      this.logger.debug(`Generating AI response for session ${sessionId}`);

      // Call AI service (replace with actual AI service integration)
      const response = await this.generateAIResponse(context, messageId);

      this.logger.debug(`AI response generated for session ${sessionId}`);

      return { content: response, sessionId };
    } catch (error) {
      this.logger.error(
        `AI response generation failed for session ${sessionId}: ${error.message}`,
      );
      throw error;
    }
  }

  private async generateAIResponse(
    context: ChatContext,
    messageId: string,
  ): Promise<string> {
    try {
      const aiResponse = await this.aiService.generateResponse(context);

      // Queue content moderation
      await this.chatQueue.add(
        'moderate-content',
        {
          messageId: messageId,
          content: context.userMessage,
          sessionId: context.sessionId,
        },
        {
          priority: 1, // High priority for safety
          attempts: 2,
        },
      );

      return aiResponse.content;
    } catch (error) {
      this.logger.error(`AI service call failed: ${error.message}`);
      throw error;
    }
  }

  private async updateContextAfterResponse(
    sessionId: string,
    userMessage: string,
    aiResponse: string,
  ): Promise<void> {
    try {
      const context = await this.contextRepository.findOne({
        where: { sessionId },
      });
      if (context) {
        const updatedContextData = {
          ...context.contextData,
          lastUserMessage: userMessage,
          lastAIResponse: aiResponse,
          interactionCount: (context.contextData?.interactionCount || 0) + 1,
          lastInteractionAt: new Date().toISOString(),
        } as Record<string, any>;

        await this.contextRepository.update(
          { sessionId },
          {
            contextData: updatedContextData,
            updatedAt: new Date(),
          },
        );
      }
    } catch (error) {
      this.logger.error(`Failed to update AI context: ${error.message}`);
    }
  }

  private analyzeSentimentTrend(conversationHistory: any[]): string {
    if (conversationHistory.length === 0) return 'neutral';

    const userMessages = conversationHistory.filter(
      (msg) => msg.senderType === 'user',
    );
    if (userMessages.length === 0) return 'neutral';

    const avgSentiment =
      userMessages.reduce((sum, msg) => sum + (msg.sentimentScore || 0), 0) /
      userMessages.length;

    if (avgSentiment > 0.3) return 'positive';
    if (avgSentiment < -0.3) return 'negative';
    return 'neutral';
  }
}
