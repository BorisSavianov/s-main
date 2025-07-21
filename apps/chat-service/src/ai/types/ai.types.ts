// apps/chat-service/src/ai/types/ai.types.ts

export interface ChatContext {
  sessionId: string;
  recentMessages: Array<{
    senderType: string;
    content: string;
    createdAt: Date;
  }>;
  userMessage: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface AIResponse {
  content: string;
  sentiment?: number;
  confidence?: number;
  topics?: string[];
  flags?: ContentFlag[];
  recommendations?: string[];
}

export interface ContentFlag {
  type: 'crisis' | 'inappropriate' | 'spam' | 'abusive';
  severity: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  confidence: number;
}
