// apps/chat-service/src/websocket/processors/ai-response.processor.ts
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiContext } from '../../ai/entities/ai-context.entity';
import { AIService } from '../../ai/ai.service';

@Processor('ai-response')
@Injectable()
export class AIResponseProcessor {
  private readonly logger = new Logger(AIResponseProcessor.name);

  constructor(
    @InjectRepository(AiContext)
    private readonly contextRepository: Repository<AiContext>,
    private readonly aiService: AIService,
  ) {}

  @Process('generate-response')
  async handleGenerateResponse(job: Job<any>) {
    const { sessionId, userMessage, context, conversationHistory } = job.data;

    try {
      this.logger.debug(`Generating AI response for session ${sessionId}`);

      // Prepare AI prompt with context
      const prompt = this.buildAIPrompt(
        userMessage,
        context,
        conversationHistory,
      );

      // Call AI service (replace with actual AI service integration)
      const response = await this.generateAIResponse(prompt, context);

      // Update context with new interaction
      await this.updateContextAfterResponse(sessionId, userMessage, response);

      this.logger.debug(`AI response generated for session ${sessionId}`);

      return { content: response, sessionId };
    } catch (error) {
      this.logger.error(
        `AI response generation failed for session ${sessionId}: ${error.message}`,
      );
      throw error;
    }
  }

  private buildAIPrompt(
    userMessage: string,
    context: any,
    conversationHistory: any[],
  ): string {
    // Build a comprehensive prompt for the AI
    const systemPrompt = `You are a compassionate mental health support assistant. 
    Your role is to provide empathetic, helpful, and supportive responses. 
    Always maintain professional boundaries and suggest professional help when appropriate.`;

    const contextInfo = context.contextData
      ? `
    Context: 
    - Conversation style: ${context.contextData.conversationStyle || 'supportive'}
    - Interaction count: ${context.contextData.interactionCount || 0}
    - User sentiment trend: ${this.analyzeSentimentTrend(conversationHistory)}
    `
      : '';

    const conversationContext =
      conversationHistory.length > 0
        ? `
    Recent conversation:
    ${conversationHistory
      .slice(-5)
      .map(
        (msg) =>
          `${msg.senderType === 'user' ? 'User' : 'Assistant'}: ${msg.content}`,
      )
      .join('\n')}
    `
        : '';

    return `${systemPrompt}\n${contextInfo}\n${conversationContext}\n\nUser: ${userMessage}\n\nAssistant:`;
  }

  private async generateAIResponse(
    prompt: string,
    context: any,
  ): Promise<string> {
    try {
      // Call your AI service here (OpenAI, Claude, local model, etc.)
      // For now, returning a mock response
      const responses = [
        "I understand how you're feeling. It's completely normal to have these thoughts and emotions.",
        "Thank you for sharing that with me. Would you like to talk more about what's been on your mind?",
        'That sounds challenging. How has this been affecting your daily life?',
        "It's great that you're reaching out for support. What would be most helpful for you right now?",
        'I hear you. Sometimes it helps to break things down into smaller, manageable steps. What feels most urgent to address?',
      ];

      return responses[Math.floor(Math.random() * responses.length)];
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
