// apps/chat-service/src/config/ai.config.ts
import { registerAs } from '@nestjs/config';

export interface OllamaConfig {
  baseUrl: string;
  defaultModel: string;
  timeout: number;
  maxRetries: number;
  models: {
    chat: string;
    embedding: string;
    sentiment: string;
    moderation: string;
  };
  defaultOptions: {
    temperature: number;
    top_p: number;
    max_tokens: number;
    stop?: string[];
  };
}

export interface AIConfig {
  provider: 'ollama' | 'anthropic';
  ollama: OllamaConfig;
  features: {
    sentimentAnalysis: boolean;
    contentModeration: boolean;
    sessionSummary: boolean;
    recommendations: boolean;
    embedding: boolean;
    topicExtraction: boolean;
  };
  limits: {
    maxMessageLength: number;
    maxSessionDuration: number; // in minutes
    maxMessagesPerSession: number;
    rateLimitPerMinute: number;
  };
  prompts: {
    systemPrompt: string;
    sentimentPrompt: string;
    moderationPrompt: string;
    summaryPrompt: string;
    recommendationPrompt: string;
  };
}

export default registerAs('ai', (): AIConfig => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return {
    provider: (process.env.AI_PROVIDER as 'ollama' | 'anthropic') || 'ollama',

    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      defaultModel: process.env.OLLAMA_DEFAULT_MODEL || 'llama3.1:8b',
      timeout: parseInt(process.env.OLLAMA_TIMEOUT || '30000', 10),
      maxRetries: parseInt(process.env.OLLAMA_MAX_RETRIES || '3', 10),
      models: {
        chat: process.env.OLLAMA_CHAT_MODEL || 'llama3.1:8b',
        embedding: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
        sentiment: process.env.OLLAMA_SENTIMENT_MODEL || 'llama3.2:1b',
        moderation: process.env.OLLAMA_MODERATION_MODEL || 'llama3.2:1b',
      },
      defaultOptions: {
        temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7'),
        top_p: parseFloat(process.env.OLLAMA_TOP_P || '0.9'),
        max_tokens: parseInt(process.env.OLLAMA_MAX_TOKENS || '256', 10),
        stop: process.env.OLLAMA_STOP_TOKENS?.split(','),
      },
    },

    features: {
      sentimentAnalysis: process.env.AI_SENTIMENT_ANALYSIS !== 'false',
      contentModeration: process.env.AI_CONTENT_MODERATION !== 'false',
      sessionSummary: process.env.AI_SESSION_SUMMARY !== 'false',
      recommendations: process.env.AI_RECOMMENDATIONS !== 'false',
      embedding: process.env.AI_EMBEDDING === 'true',
      topicExtraction: process.env.AI_TOPIC_EXTRACTION !== 'false',
    },

    limits: {
      maxMessageLength: parseInt(
        process.env.AI_MAX_MESSAGE_LENGTH || '4000',
        10,
      ),
      maxSessionDuration: parseInt(
        process.env.AI_MAX_SESSION_DURATION || '120',
        10,
      ),
      maxMessagesPerSession: parseInt(
        process.env.AI_MAX_MESSAGES_PER_SESSION || '100',
        10,
      ),
      rateLimitPerMinute: parseInt(
        process.env.AI_RATE_LIMIT_PER_MINUTE || '20',
        10,
      ),
    },

    prompts: {
      systemPrompt:
        process.env.AI_SYSTEM_PROMPT ||
        `You are a supportive mental health AI assistant. You provide empathetic, helpful responses while being careful not to provide medical advice. Always encourage users to seek professional help for serious concerns.

Guidelines:
- Be empathetic and understanding
- Avoid giving medical diagnoses or advice
- Encourage professional help when appropriate
- Maintain confidentiality and respect privacy
- Use active listening techniques
- Provide coping strategies and resources when relevant`,

      sentimentPrompt:
        process.env.AI_SENTIMENT_PROMPT ||
        `Analyze the emotional sentiment of the following text and respond with only a number between -1.0 (very negative) and 1.0 (very positive), where 0.0 is neutral:

"{text}"

Consider the emotional tone, word choice, and overall mood. Sentiment score:`,

      moderationPrompt:
        process.env.AI_MODERATION_PROMPT ||
        `Analyze the following message for potentially harmful content including:
- Expressions of self-harm or suicide
- Abusive language or harassment
- Inappropriate or explicit content
- Spam or meaningless text

Respond with either "FLAG: [reason]" or "SAFE" only:

"{text}"

Analysis:`,

      summaryPrompt:
        process.env.AI_SUMMARY_PROMPT ||
        `Summarize the key points and themes from this mental health support conversation in 2-3 sentences. Focus on the main concerns discussed, progress made, and any important insights or recommendations provided:

{conversation}

Summary:`,

      recommendationPrompt:
        process.env.AI_RECOMMENDATION_PROMPT ||
        `Based on the following conversation, suggest 3-5 helpful therapeutic recommendations or coping strategies. Format each recommendation as a single sentence on a new line:

{conversation}

Focus on:
- Practical coping strategies
- Self-care activities
- Professional resources
- Mindfulness techniques
- Healthy lifestyle choices

Recommendations:`,
    },
  };
});

// Specialized configurations for different AI use cases
export const sentimentAnalysisConfig = registerAs('sentimentAnalysis', () => ({
  model: process.env.SENTIMENT_MODEL || 'llama3.2:1b',
  temperature: 0.1, // Lower temperature for more consistent results
  maxTokens: 10,
  batchSize: parseInt(process.env.SENTIMENT_BATCH_SIZE || '10', 10),
  cacheResults: process.env.SENTIMENT_CACHE_RESULTS !== 'false',
  cacheTTL: parseInt(process.env.SENTIMENT_CACHE_TTL || '3600', 10), // 1 hour
}));

export const moderationConfig = registerAs('moderation', () => ({
  model: process.env.MODERATION_MODEL || 'llama3.2:1b',
  temperature: 0.1,
  maxTokens: 50,
  thresholds: {
    selfHarm: parseFloat(process.env.MODERATION_SELF_HARM_THRESHOLD || '0.8'),
    harassment: parseFloat(
      process.env.MODERATION_HARASSMENT_THRESHOLD || '0.8',
    ),
    explicit: parseFloat(process.env.MODERATION_EXPLICIT_THRESHOLD || '0.8'),
    spam: parseFloat(process.env.MODERATION_SPAM_THRESHOLD || '0.8'),
  },
  autoFlag: process.env.MODERATION_AUTO_FLAG !== 'false',
  notifyAdmins: process.env.MODERATION_NOTIFY_ADMINS === 'true',
}));

export const embeddingConfig = registerAs('embedding', () => ({
  model: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
  dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768', 10),
  batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '100', 10),
  similarity: {
    threshold: parseFloat(process.env.EMBEDDING_SIMILARITY_THRESHOLD || '0.8'),
    metric: process.env.EMBEDDING_SIMILARITY_METRIC || 'cosine',
  },
  storage: {
    enabled: process.env.EMBEDDING_STORAGE_ENABLED === 'true',
    provider: process.env.EMBEDDING_STORAGE_PROVIDER || 'postgres', // postgres, pinecone, weaviate
  },
}));

// Type-safe configuration validation
export const validateAIConfig = (config: any): AIConfig => {
  const errors: string[] = [];

  // Validate provider
  if (!['ollama', 'anthropic'].includes(config.provider)) {
    errors.push('AI_PROVIDER must be one of: ollama, anthropic');
  }

  // Validate Ollama configuration
  if (config.provider === 'ollama') {
    if (!config.ollama.baseUrl) {
      errors.push('OLLAMA_BASE_URL is required when using Ollama provider');
    }
    if (!config.ollama.defaultModel) {
      errors.push(
        'OLLAMA_DEFAULT_MODEL is required when using Ollama provider',
      );
    }
  }

  // Validate limits
  if (
    config.limits.maxMessageLength < 1 ||
    config.limits.maxMessageLength > 10000
  ) {
    errors.push('AI_MAX_MESSAGE_LENGTH must be between 1 and 10000');
  }

  if (
    config.limits.rateLimitPerMinute < 1 ||
    config.limits.rateLimitPerMinute > 1000
  ) {
    errors.push('AI_RATE_LIMIT_PER_MINUTE must be between 1 and 1000');
  }

  // Validate temperature values
  if (
    config.ollama.defaultOptions.temperature < 0 ||
    config.ollama.defaultOptions.temperature > 2
  ) {
    errors.push('Temperature values must be between 0 and 2');
  }

  if (errors.length > 0) {
    throw new Error(
      `AI configuration validation failed:\n${errors.join('\n')}`,
    );
  }

  return config;
};

// AI service health check utility
export const createAIHealthCheck = () => {
  return {
    name: 'ai-service',
    timeout: 10000,
    check: async (aiService: any) => {
      try {
        const result = await aiService.healthCheck();
        return {
          status: result.status === 'healthy' ? 'up' : 'down',
          model: result.model,
          latency: result.latency,
        };
      } catch (error) {
        return {
          status: 'down',
          message: error.message,
        };
      }
    },
  };
};
