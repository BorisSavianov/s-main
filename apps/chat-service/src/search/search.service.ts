// apps/chat-service/src/search/search.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { AiContext } from '../ai/entities/ai-context.entity';
import { AIService } from '../ai/ai.service';

import {
  IndicesCreateRequest,
  SearchRequest,
} from '@elastic/elasticsearch/lib/api/types';
import { BulkRequest } from '@elastic/elasticsearch/lib/api/types';

export interface SearchQuery {
  query: string;
  sessionId?: string;
  userId?: string;
  senderType?: 'user' | 'ai' | 'counselor';
  startDate?: Date;
  endDate?: Date;
  sentiment?: 'positive' | 'negative' | 'neutral';
  limit?: number;
  offset?: number;
  includeHighlights?: boolean;
  includeFacets?: boolean;
}

export interface SearchResult {
  id: string;
  content: string;
  sessionId: string;
  senderType: string;
  senderId?: string;
  sentiment?: number;
  createdAt: Date;
  updatedAt: Date;
  relevanceScore: number;
  highlights?: string[];
  contextSnippet?: string;
}

export interface SemanticSearchResult extends SearchResult {
  semanticScore: number;
  embedding?: number[];
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  took: number;
  query: string;
  facets?: {
    senderTypes: Record<string, number>;
    sentiments: Record<string, number>;
    dates: Record<string, number>;
    sessions: Record<string, number>;
  };
}

export interface SearchSuggestion {
  text: string;
  score: number;
  type: 'keyword' | 'phrase' | 'entity';
}

export interface SearchAnalytics {
  totalMessages: number;
  averageSentiment: number;
  messagesByHour: Array<{ hour: string; count: number; avgSentiment: number }>;
  senderDistribution: Record<string, number>;
  sentimentDistribution: Record<string, number>;
  topKeywords: Array<{ keyword: string; frequency: number; sentiment: number }>;
  sessionActivity: Array<{
    sessionId: string;
    messageCount: number;
    lastActivity: Date;
  }>;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly INDEX_NAME = 'chat_messages';
  private readonly SUGGESTION_INDEX = 'search_suggestions';

  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(ChatSession)
    private readonly sessionRepository: Repository<ChatSession>,
    @InjectRepository(AiContext)
    private readonly contextRepository: Repository<AiContext>,
    @InjectQueue('search-indexing')
    private readonly indexingQueue: Queue,
    private readonly aiService: AIService,
  ) {
    this.initializeIndices();
  }

  /**
   * Initialize Elasticsearch indices with proper mappings
   */
  private async initializeIndices(): Promise<void> {
    try {
      await Promise.all([
        this.createMessageIndex(),
        this.createSuggestionIndex(),
      ]);
      this.logger.log('Elasticsearch indices initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize indices: ${error.message}`);
    }
  }

  private async createMessageIndex(): Promise<void> {
    const indexExists = await this.elasticsearchService.indices.exists({
      index: this.INDEX_NAME,
    });

    if (!indexExists) {
      await this.elasticsearchService.indices.create({
        index: this.INDEX_NAME,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            sessionId: { type: 'keyword' },
            senderId: { type: 'keyword' },
            senderType: { type: 'keyword' },
            content: {
              type: 'text',
              analyzer: 'mental_health_analyzer',
              fields: {
                keyword: { type: 'keyword' },
                suggest: {
                  type: 'completion',
                  analyzer: 'simple',
                },
                raw: {
                  type: 'text',
                  analyzer: 'keyword',
                },
              },
            },
            contentType: { type: 'keyword' },
            sentimentScore: { type: 'float' },
            isFlagged: { type: 'boolean' },
            flagReason: { type: 'text' },
            embedding: {
              type: 'dense_vector',
              dims: 768,
              index: true,
              similarity: 'cosine',
            },
            topics: { type: 'keyword' },
            entities: {
              type: 'nested',
              properties: {
                type: { type: 'keyword' },
                value: { type: 'keyword' },
                confidence: { type: 'float' },
              },
            },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' },
          },
        },
        settings: {
          number_of_shards: 1,
          number_of_replicas: process.env.NODE_ENV === 'production' ? 1 : 0,
          analysis: {
            analyzer: {
              mental_health_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: [
                  'lowercase',
                  'stop',
                  'mental_health_stemmer',
                  'mental_health_synonyms',
                ],
              },
            },
            filter: {
              mental_health_stemmer: {
                type: 'stemmer',
                language: 'english',
              },
              mental_health_synonyms: {
                type: 'synonym',
                synonyms: [
                  'sad,depressed,down,blue,melancholy,dejected',
                  'anxious,worried,nervous,stressed,fearful,apprehensive',
                  'angry,mad,furious,irritated,frustrated,annoyed',
                  'happy,joyful,glad,cheerful,elated,content',
                  'therapy,counseling,treatment,support',
                  'panic,anxiety attack,panic attack',
                  'insomnia,sleeplessness,sleep problems',
                ],
              },
            },
          },
        },
      });
    }
  }

  private async createSuggestionIndex(): Promise<void> {
    const indexExists = await this.elasticsearchService.indices.exists({
      index: this.SUGGESTION_INDEX,
    });

    if (!indexExists) {
      const body = {
        mappings: {
          properties: {
            suggest: {
              type: 'completion' as const,
              analyzer: 'simple',
              preserve_separators: true,
              preserve_position_increments: true,
              max_input_length: 50,
            },
            type: { type: 'keyword' as const },
            frequency: { type: 'integer' as const },
            sessionId: { type: 'keyword' as const },
            createdAt: { type: 'date' as const },
          },
        },
      };

      await this.elasticsearchService.indices.create({
        index: this.SUGGESTION_INDEX,
        ...body,
      });
    }
  }

  /**
   * Advanced search with multiple strategies
   */
  async searchMessages(searchQuery: SearchQuery): Promise<SearchResponse> {
    try {
      const {
        query,
        sessionId,
        userId,
        senderType,
        startDate,
        endDate,
        sentiment,
        limit = 20,
        offset = 0,
        includeHighlights = true,
        includeFacets = true,
      } = searchQuery;

      const must: any[] = [];
      const filter: any[] = [];
      const should: any[] = [];

      // Multi-field text search with boosting
      if (query && query.trim()) {
        must.push({
          bool: {
            should: [
              // Exact phrase match (highest boost)
              {
                match_phrase: {
                  content: {
                    query,
                    boost: 3.0,
                  },
                },
              },
              // Multi-match across fields
              {
                multi_match: {
                  query,
                  fields: ['content^2', 'content.keyword^1.5'],
                  type: 'best_fields',
                  fuzziness: 'AUTO',
                  boost: 2.0,
                },
              },
              // Fuzzy match for typos
              {
                fuzzy: {
                  content: {
                    value: query,
                    fuzziness: 'AUTO',
                    boost: 0.5,
                  },
                },
              },
            ],
            minimum_should_match: 1,
          },
        });

        // Add context-aware boosting
        should.push({
          more_like_this: {
            fields: ['content'],
            like: query,
            min_term_freq: 1,
            max_query_terms: 12,
            boost: 1.2,
          },
        });
      }

      // Apply filters
      if (sessionId) filter.push({ term: { sessionId } });
      if (senderType) filter.push({ term: { senderType } });
      if (startDate || endDate) {
        const dateRange: any = {};
        if (startDate) dateRange.gte = startDate;
        if (endDate) dateRange.lte = endDate;
        filter.push({ range: { createdAt: dateRange } });
      }
      if (sentiment) {
        const sentimentRange = this.getSentimentRange(sentiment);
        filter.push({ range: { sentimentScore: sentimentRange } });
      }

      // Exclude flagged messages by default
      filter.push({ term: { isFlagged: false } });

      const searchBody: any = {
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter,
            should,
          },
        },
        sort: [{ _score: { order: 'desc' } }, { createdAt: { order: 'desc' } }],
        from: offset,
        size: limit,
        _source: {
          excludes: ['embedding'], // Exclude large embedding field from results
        },
      };

      // Add highlighting
      if (includeHighlights && query) {
        searchBody.highlight = {
          fields: {
            content: {
              fragment_size: 150,
              number_of_fragments: 3,
              pre_tags: ['<mark>'],
              post_tags: ['</mark>'],
            },
          },
          order: 'score',
        };
      }

      // Add facets/aggregations
      if (includeFacets) {
        searchBody.aggs = {
          sender_types: {
            terms: { field: 'senderType', size: 10 },
          },
          sentiment_ranges: {
            range: {
              field: 'sentimentScore',
              ranges: [
                { key: 'very_negative', to: -0.5 },
                { key: 'negative', from: -0.5, to: -0.1 },
                { key: 'neutral', from: -0.1, to: 0.1 },
                { key: 'positive', from: 0.1, to: 0.5 },
                { key: 'very_positive', from: 0.5 },
              ],
            },
          },
          date_histogram: {
            date_histogram: {
              field: 'createdAt',
              calendar_interval: 'day',
              min_doc_count: 1,
            },
          },
          sessions: {
            terms: { field: 'sessionId', size: 10 },
          },
        };
      }

      const response = await this.elasticsearchService.search({
        index: this.INDEX_NAME,
        ...searchBody,
      });

      return this.formatSearchResponse(response, query);
    } catch (error) {
      this.logger.error(`Search failed: ${error.message}`, error.stack);
      throw new Error(`Search operation failed: ${error.message}`);
    }
  }

  /**
   * Semantic search using vector embeddings with hybrid scoring
   */
  async semanticSearch(
    query: string,
    sessionId?: string,
    limit: number = 10,
    threshold: number = 0.7,
  ): Promise<{ results: SemanticSearchResult[]; total: number; took: number }> {
    try {
      this.logger.log('1');
      // Generate embedding for the query
      const queryEmbedding = await this.aiService.generateEmbedding(query);
      this.logger.log('2 ' + queryEmbedding);
      this.logger.log('2.5 ' + queryEmbedding?.length);

      if (!queryEmbedding) {
        this.logger.warn(
          'Failed to generate query embedding, falling back to text search',
        );
        const textResults = await this.searchMessages({
          query,
          sessionId,
          limit,
        });
        return {
          results: textResults.results.map((r) => ({ ...r, semanticScore: 0 })),
          total: textResults.total,
          took: textResults.took,
        };
      }

      const filter: any[] = [{ term: { isFlagged: false } }];
      if (sessionId) filter.push({ term: { sessionId } });

      this.logger.log('3 ' + JSON.stringify(filter));

      const searchBody = {
        query: {
          bool: {
            must: [
              {
                script_score: {
                  query: { bool: { filter } },
                  script: {
                    source: `
                if (doc['embedding'].length == 0) {
                  return 0;
                }
                double cosineSim = cosineSimilarity(params.query_vector, 'embedding') + 1.0;
                return cosineSim;
              `,
                    params: {
                      query_vector: queryEmbedding,
                    },
                  },
                },
              },
            ],
          },
        },
        size: limit,
        min_score: threshold,
        _source: {
          excludes: ['embedding'],
        },
      };
      this.logger.log('4 ' + JSON.stringify(searchBody));

      const response = await this.elasticsearchService.search({
        index: this.INDEX_NAME,
        ...searchBody,
      });

      const results: SemanticSearchResult[] = response.hits.hits.map(
        (hit: any) => ({
          id: hit._source.id,
          content: hit._source.content,
          sessionId: hit._source.sessionId,
          senderType: hit._source.senderType,
          senderId: hit._source.senderId,
          sentiment: hit._source.sentimentScore,
          createdAt: new Date(hit._source.createdAt),
          updatedAt: new Date(hit._source.updatedAt),
          relevanceScore: hit._score,
          semanticScore: hit._score - 1, // Adjust for the +1.0 in the script
        }),
      );

      return {
        results,
        total: Number(response.hits.total!.valueOf()) || 0,
        took: response.took,
      };
    } catch (error) {
      this.logger.error(`Semantic search failed: ${error.message}`);
      throw new Error(`Semantic search operation failed: ${error.message}`);
    }
  }

  /**
   * Hybrid search combining text and semantic search
   */
  async hybridSearch(
    query: string,
    sessionId?: string,
    limit: number = 10,
    textWeight: number = 0.7,
    semanticWeight: number = 0.3,
  ): Promise<SearchResponse> {
    try {
      // Execute both searches in parallel
      const [textResults, semanticResults] = await Promise.all([
        this.searchMessages({
          query,
          sessionId,
          limit: Math.ceil(limit * 1.5), // Get more results for better merging
          includeFacets: false,
        }),
        this.semanticSearch(query, sessionId, Math.ceil(limit * 1.5), 0.5),
      ]);

      // Merge and rerank results
      const mergedResults = this.mergeSearchResults(
        textResults.results,
        semanticResults.results,
        textWeight,
        semanticWeight,
      ).slice(0, limit);

      return {
        results: mergedResults,
        total: Math.max(textResults.total, semanticResults.total),
        took: textResults.took + semanticResults.took,
        query,
        facets: textResults.facets,
      };
    } catch (error) {
      this.logger.error(`Hybrid search failed: ${error.message}`);
      throw new Error(`Hybrid search operation failed: ${error.message}`);
    }
  }

  /**
   * Get intelligent search suggestions with context
   */
  async getSuggestions(
    prefix: string,
    sessionId?: string,
    limit: number = 10,
  ): Promise<SearchSuggestion[]> {
    try {
      const suggestions: SearchSuggestion[] = [];

      // Get completion suggestions
      const completionResponse = await this.elasticsearchService.search({
        index: this.INDEX_NAME,
        suggest: {
          content_suggest: {
            prefix,
            completion: {
              field: 'content.suggest',
              size: limit,
              contexts: sessionId ? { sessionId: [sessionId] } : undefined,
            },
          },
        },
      });

      const rawOptions =
        completionResponse.suggest?.content_suggest?.[0]?.options;
      const completions = Array.isArray(rawOptions) ? rawOptions : [rawOptions];

      suggestions.push(
        ...completions.map((option: any) => ({
          text: option.text,
          score: option._score,
          type: 'keyword' as const,
        })),
      );

      // Get phrase suggestions from recent messages
      const phraseResponse = await this.searchMessages({
        query: prefix,
        sessionId,
        limit: 5,
        includeHighlights: false,
        includeFacets: false,
      });

      // Extract meaningful phrases from results
      for (const result of phraseResponse.results) {
        const phrases = this.extractPhrases(result.content, prefix);
        suggestions.push(
          ...phrases.map((phrase) => ({
            text: phrase,
            score: result.relevanceScore * 0.8,
            type: 'phrase' as const,
          })),
        );
      }

      // Remove duplicates and sort by score
      const uniqueSuggestions = suggestions
        .filter(
          (suggestion, index, self) =>
            index ===
            self.findIndex(
              (s) => s.text.toLowerCase() === suggestion.text.toLowerCase(),
            ),
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return uniqueSuggestions;
    } catch (error) {
      this.logger.error(`Get suggestions failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Extract meaningful phrases from text
   */
  private extractPhrases(text: string, prefix: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const prefixLower = prefix.toLowerCase();
    const phrases: string[] = [];

    for (let i = 0; i < words.length; i++) {
      if (words[i].includes(prefixLower)) {
        // Extract 2-4 word phrases containing the prefix
        for (let len = 2; len <= 4 && i + len <= words.length; len++) {
          const phrase = words.slice(i, i + len).join(' ');
          if (phrase.length > prefix.length && phrase.length < 50) {
            phrases.push(phrase);
          }
        }
      }
    }

    return phrases.slice(0, 3); // Limit phrases per text
  }

  /**
   * Index a single message with enriched data
   */
  async indexMessage(
    message: ChatMessage,
    generateEmbedding: boolean = true,
  ): Promise<void> {
    try {
      const document: any = {
        id: message.id,
        sessionId: message.sessionId,
        senderId: message.senderId,
        senderType: message.senderType,
        content: message.content,
        contentType: message.contentType || 'text',
        sentimentScore: message.sentimentScore,
        isFlagged: message.isFlagged || false,
        flagReason: message.flagReason,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      };
      // Generate and add embedding if requested and not already present
      if (generateEmbedding && message.content && !message.embedding) {
        const embedding = await this.aiService.generateEmbedding(
          message.content,
        );
        if (embedding) {
          document.embedding = embedding;
          // Manually format the array into a vector literal string
          const embeddingString = `[${embedding.join(',')}]`;

          // Update the message record with the correctly formatted embedding
          await this.messageRepository.update(message.id, {
            // Use a function to pass the raw string to the query builder
            embedding: () => `'${embeddingString}'`,
          });
        }
      } else if (message.embedding) {
        document.embedding = message.embedding;
      }

      // Extract topics and entities (simplified implementation)
      document.topics = this.extractTopics(message.content);
      document.entities = this.extractEntities(message.content);

      await this.elasticsearchService.index({
        index: this.INDEX_NAME,
        id: message.id,
        ...document,
      });
      // Update search suggestions
      await this.updateSuggestions(message.content, message.sessionId);
      this.logger.debug(`Message ${message.id} indexed successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to index message ${message.id}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Update search suggestions based on message content
   */
  private async updateSuggestions(
    content: string,
    sessionId: string,
  ): Promise<void> {
    try {
      const words = content
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2);

      const suggestions: Array<{
        suggest: {
          input: string[];
          weight: number;
        };
        type: string;
        sessionId: string;
        frequency: number;
        createdAt: Date;
      }> = [];

      // Add individual meaningful words
      for (const word of words) {
        if (this.isMeaningfulWord(word)) {
          suggestions.push({
            suggest: {
              input: [word],
              weight: 1,
            },
            type: 'keyword',
            sessionId,
            frequency: 1,
            createdAt: new Date(),
          });
        }
      }

      // Add 2-3 word phrases
      for (let i = 0; i < words.length - 1; i++) {
        const phrase = words.slice(i, i + 2).join(' ');
        if (phrase.length > 4) {
          suggestions.push({
            suggest: {
              input: [phrase],
              weight: 2,
            },
            type: 'phrase',
            sessionId,
            frequency: 1,
            createdAt: new Date(),
          });
        }
      }

      // Batch index suggestions
      if (suggestions.length > 0) {
        const body = suggestions.flatMap((suggestion) => [
          { index: { _index: this.SUGGESTION_INDEX } },
          suggestion,
        ]);

        await this.elasticsearchService.bulk({ operations: body });
      }
    } catch (error) {
      this.logger.error(`Failed to update suggestions: ${error.message}`);
    }
  }

  /**
   * Check if a word is meaningful for suggestions
   */
  private isMeaningfulWord(word: string): boolean {
    const stopWords = new Set([
      'the',
      'be',
      'to',
      'of',
      'and',
      'a',
      'in',
      'that',
      'have',
      'i',
      'it',
      'for',
      'not',
      'on',
      'with',
      'he',
      'as',
      'you',
      'do',
      'at',
      'this',
      'but',
      'his',
      'by',
      'from',
      'they',
      'we',
      'say',
      'her',
      'she',
      'or',
      'an',
      'will',
      'my',
      'one',
      'all',
      'would',
      'there',
      'their',
      'what',
      'so',
      'up',
      'out',
      'if',
      'about',
      'who',
      'get',
      'which',
      'go',
      'me',
    ]);

    return !stopWords.has(word) && word.length > 2;
  }

  /**
   * Simple topic extraction (can be enhanced with NLP libraries)
   */
  private extractTopics(content: string): string[] {
    const mentalHealthKeywords = {
      anxiety: ['anxious', 'worried', 'nervous', 'panic', 'fear'],
      depression: ['sad', 'depressed', 'down', 'hopeless', 'empty'],
      stress: ['stressed', 'overwhelmed', 'pressure', 'tension'],
      sleep: ['insomnia', 'sleepless', 'tired', 'exhausted', 'sleep'],
      relationships: ['family', 'friends', 'partner', 'social', 'lonely'],
      work: ['job', 'career', 'workplace', 'boss', 'colleague'],
      therapy: ['therapy', 'counseling', 'therapist', 'treatment'],
    };

    const topics: string[] = [];
    const contentLower = content.toLowerCase();

    for (const [topic, keywords] of Object.entries(mentalHealthKeywords)) {
      if (keywords.some((keyword) => contentLower.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  /**
   * Simple entity extraction (can be enhanced with NLP libraries)
   */
  private extractEntities(
    content: string,
  ): Array<{ type: string; value: string; confidence: number }> {
    const entities: Array<{ type: string; value: string; confidence: number }> =
      [];

    // Extract time expressions
    const timePatterns = [
      /(\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)/gi,
      /(today|tomorrow|yesterday|tonight)/gi,
      /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
    ];

    timePatterns.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          entities.push({
            type: 'TIME',
            value: match.trim(),
            confidence: 0.8,
          });
        });
      }
    });

    // Extract emotions (simplified)
    const emotionWords = [
      'happy',
      'sad',
      'angry',
      'frustrated',
      'anxious',
      'worried',
      'excited',
      'nervous',
      'calm',
      'peaceful',
      'stressed',
      'overwhelmed',
    ];

    const contentLower = content.toLowerCase();
    emotionWords.forEach((emotion) => {
      if (contentLower.includes(emotion)) {
        entities.push({
          type: 'EMOTION',
          value: emotion,
          confidence: 0.7,
        });
      }
    });

    return entities;
  }

  /**
   * Merge and rerank results from different search strategies
   */
  private mergeSearchResults(
    textResults: SearchResult[],
    semanticResults: SemanticSearchResult[],
    textWeight: number,
    semanticWeight: number,
  ): SearchResult[] {
    const merged = new Map<string, SearchResult>();

    // Add text results
    textResults.forEach((result) => {
      merged.set(result.id, {
        ...result,
        relevanceScore: result.relevanceScore * textWeight,
      });
    });

    // Merge semantic results
    semanticResults.forEach((result) => {
      const existing = merged.get(result.id);
      if (existing) {
        // Combine scores
        existing.relevanceScore += result.semanticScore * semanticWeight;
      } else {
        merged.set(result.id, {
          ...result,
          relevanceScore: result.semanticScore * semanticWeight,
        });
      }
    });

    // Sort by combined relevance score
    return Array.from(merged.values()).sort(
      (a, b) => b.relevanceScore - a.relevanceScore,
    );
  }

  /**
   * Queue message for indexing
   */
  async queueMessageForIndexing(
    messageId: string,
    priority: number = 0,
  ): Promise<void> {
    try {
      await this.indexingQueue.add(
        'index-message',
        { messageId },
        {
          priority,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue message for indexing: ${error.message}`,
      );
    }
  }

  /**
   * Bulk index messages with batch processing
   */
  async bulkIndexMessages(
    messages: ChatMessage[],
    batchSize: number = 100,
  ): Promise<void> {
    try {
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);

        const body: BulkRequest['body'] = [];

        for (const message of batch) {
          body.push(
            { index: { _index: this.INDEX_NAME, _id: message.id } },
            {
              id: message.id,
              sessionId: message.sessionId,
              senderId: message.senderId,
              senderType: message.senderType,
              content: message.content,
              contentType: message.contentType || 'text',
              sentimentScore: message.sentimentScore,
              isFlagged: message.isFlagged || false,
              flagReason: message.flagReason,
              embedding: message.embedding,
              topics: this.extractTopics(message.content),
              entities: this.extractEntities(message.content),
              createdAt: message.createdAt,
              updatedAt: message.updatedAt,
            },
          );
        }

        const response = await this.elasticsearchService.bulk({ body });

        if (response.errors) {
          const failedDocs = response.items.filter(
            (item: any) => item.index?.error,
          );
          this.logger.warn(
            `${failedDocs.length} documents failed to index in batch`,
          );
        }

        this.logger.debug(
          `Indexed batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(messages.length / batchSize)}`,
        );
      }

      this.logger.log(`Bulk indexed ${messages.length} messages successfully`);
    } catch (error) {
      this.logger.error(`Bulk indexing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete message from index
   */
  async deleteMessage(messageId: string): Promise<void> {
    try {
      await this.elasticsearchService.delete({
        index: this.INDEX_NAME,
        id: messageId,
      });

      this.logger.debug(`Message ${messageId} deleted from index`);
    } catch (error) {
      if (error.meta?.statusCode !== 404) {
        this.logger.error(
          `Failed to delete message from index: ${error.message}`,
        );
        throw error;
      }
      // Message not found in index - not an error
    }
  }

  /**
   * Update message in index
   */
  async updateMessage(
    messageId: string,
    updates: Partial<ChatMessage>,
  ): Promise<void> {
    try {
      const updateDoc: any = {};

      if (updates.content) {
        updateDoc.content = updates.content;
        updateDoc.topics = this.extractTopics(updates.content);
        updateDoc.entities = this.extractEntities(updates.content);

        // Regenerate embedding if content changed
        const embedding = await this.aiService.generateEmbedding(
          updates.content,
        );
        if (embedding) {
          updateDoc.embedding = embedding;
        }
      }

      if (updates.sentimentScore !== undefined) {
        updateDoc.sentimentScore = updates.sentimentScore;
      }

      if (updates.isFlagged !== undefined) {
        updateDoc.isFlagged = updates.isFlagged;
        updateDoc.flagReason = updates.flagReason;
      }

      updateDoc.updatedAt = new Date();

      await this.elasticsearchService.update({
        index: this.INDEX_NAME,
        id: messageId,
        retry_on_conflict: 3, // Handle rapid sequential updates
        body: {
          doc: updateDoc,
        },
      });

      this.logger.debug(`Message ${messageId} updated in index`);
    } catch (error) {
      this.logger.error(`Failed to update message in index: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get comprehensive search analytics
   */
  async getSearchAnalytics(
    sessionId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<SearchAnalytics> {
    try {
      type SearchAggs = {
        total_messages: {
          value: number;
        };
        average_sentiment: {
          value: number;
        };
        messages_by_hour: {
          buckets: Array<{
            key_as_string: string;
            doc_count: number;
            avg_sentiment: {
              value: number;
            };
          }>;
        };
        sender_distribution: {
          buckets: Array<{
            key: string;
            doc_count: number;
          }>;
        };
        sentiment_distribution: {
          buckets: Array<{
            key: number;
            doc_count: number;
          }>;
        };
        top_keywords: {
          buckets: Array<{
            key: string;
            doc_count: number;
            avg_sentiment: {
              value: number;
            };
          }>;
        };
        session_activity: {
          buckets: Array<{
            key: string;
            message_count: {
              value: number;
            };
            last_activity: {
              value: number;
            };
          }>;
        };
        topics_distribution: {
          buckets: Array<{
            key: string;
            doc_count: number;
          }>;
        };
        entity_types: {
          types: {
            buckets: Array<{
              key: string;
              doc_count: number;
            }>;
          };
        };
      };

      const filter: any[] = [{ term: { isFlagged: false } }];

      if (sessionId) {
        filter.push({ term: { sessionId } });
      }

      if (startDate || endDate) {
        const dateRange: any = {};
        if (startDate) dateRange.gte = startDate;
        if (endDate) dateRange.lte = endDate;
        filter.push({ range: { createdAt: dateRange } });
      }

      const response = await this.elasticsearchService.search<any, SearchAggs>({
        index: this.INDEX_NAME,
        body: {
          size: 0,
          query: {
            bool: { filter },
          },
          aggs: {
            total_messages: {
              value_count: { field: 'id' },
            },
            average_sentiment: {
              avg: { field: 'sentimentScore' },
            },
            messages_by_hour: {
              date_histogram: {
                field: 'createdAt',
                calendar_interval: 'hour',
                min_doc_count: 1,
              },
              aggs: {
                avg_sentiment: {
                  avg: { field: 'sentimentScore' },
                },
              },
            },
            sender_distribution: {
              terms: { field: 'senderType', size: 10 },
            },
            sentiment_distribution: {
              histogram: {
                field: 'sentimentScore',
                interval: 0.2,
                min_doc_count: 1,
                extended_bounds: {
                  min: -1.0,
                  max: 1.0,
                },
              },
            },
            top_keywords: {
              significant_text: {
                field: 'content',
                size: 20,
                min_doc_count: 2,
              },
              aggs: {
                avg_sentiment: {
                  avg: { field: 'sentimentScore' },
                },
              },
            },
            session_activity: {
              terms: {
                field: 'sessionId',
                size: 50,
                order: { last_activity: 'desc' },
              },
              aggs: {
                message_count: {
                  value_count: { field: 'id' },
                },
                last_activity: {
                  max: { field: 'createdAt' },
                },
              },
            },
            topics_distribution: {
              terms: { field: 'topics', size: 20 },
            },
            entity_types: {
              nested: {
                path: 'entities',
              },
              aggs: {
                types: {
                  terms: { field: 'entities.type', size: 10 },
                },
              },
            },
          },
        },
      } as Record<string, any>);

      const aggs = response.aggregations!;

      return {
        totalMessages: aggs.total_messages.value || 0,
        averageSentiment: parseFloat(
          (aggs.average_sentiment.value || 0).toFixed(3),
        ),
        messagesByHour: (aggs.messages_by_hour.buckets || []).map(
          (bucket: any) => ({
            hour: bucket.key_as_string,
            count: bucket.doc_count,
            avgSentiment: parseFloat(
              (bucket.avg_sentiment.value || 0).toFixed(3),
            ),
          }),
        ),
        senderDistribution: this.formatTermsAggregation(
          aggs.sender_distribution,
        ),
        sentimentDistribution: this.formatHistogramAggregation(
          aggs.sentiment_distribution,
        ),
        topKeywords: (aggs.top_keywords.buckets || []).map((bucket: any) => ({
          keyword: bucket.key,
          frequency: bucket.doc_count,
          sentiment: parseFloat((bucket.avg_sentiment.value || 0).toFixed(3)),
        })),
        sessionActivity: (aggs.session_activity.buckets || []).map(
          (bucket: any) => ({
            sessionId: bucket.key,
            messageCount: bucket.message_count.value,
            lastActivity: new Date(bucket.last_activity.value),
          }),
        ),
      };
    } catch (error) {
      this.logger.error(`Analytics query failed: ${error.message}`);
      throw new Error(`Analytics operation failed: ${error.message}`);
    }
  }

  /**
   * Get search performance metrics
   */
  async getPerformanceMetrics(): Promise<{
    indexSize: number;
    documentCount: number;
    searchLatency: number;
    indexingRate: number;
    cacheHitRatio: number;
  }> {
    try {
      const [indexStats, searchTest] = await Promise.all([
        this.elasticsearchService.indices.stats({ index: this.INDEX_NAME }),
        this.performSearchLatencyTest(),
      ]);

      const stats = indexStats.indices![this.INDEX_NAME];

      return {
        indexSize: stats?.total?.store?.size_in_bytes || 0,
        documentCount: stats?.total?.docs?.count || 0,
        searchLatency: searchTest.latency,
        indexingRate: await this.calculateIndexingRate(),
        cacheHitRatio: this.calculateCacheHitRatio(stats),
      };
    } catch (error) {
      this.logger.error(`Failed to get performance metrics: ${error.message}`);
      return {
        indexSize: 0,
        documentCount: 0,
        searchLatency: 0,
        indexingRate: 0,
        cacheHitRatio: 0,
      };
    }
  }

  /**
   * Perform search latency test
   */
  private async performSearchLatencyTest(): Promise<{ latency: number }> {
    const start = Date.now();

    try {
      await this.elasticsearchService.search({
        index: this.INDEX_NAME,
        body: {
          query: { match_all: {} },
          size: 1,
        } as Record<string, any>,
      });

      return { latency: Date.now() - start };
    } catch (error) {
      return { latency: -1 };
    }
  }

  /**
   * Calculate indexing rate (messages per minute)
   */
  private async calculateIndexingRate(): Promise<number> {
    try {
      const oneMinuteAgo = new Date(Date.now() - 60000);

      const response = await this.elasticsearchService.search({
        index: this.INDEX_NAME,
        body: {
          size: 0,
          query: {
            range: {
              createdAt: {
                gte: oneMinuteAgo,
              },
            },
          },
        },
      } as Record<string, any>);

      return Number(response.hits.total!.valueOf()) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate cache hit ratio from index stats
   */
  private calculateCacheHitRatio(stats: any): number {
    const queryCache = stats?.total?.query_cache;
    if (!queryCache || !queryCache.total_count) {
      return 0;
    }

    return parseFloat(
      ((queryCache.hit_count / queryCache.total_count) * 100).toFixed(2),
    );
  }

  /**
   * Health check for search service
   */
  async healthCheck(): Promise<{
    status: string;
    cluster?: any;
    indexHealth?: any;
    performance?: any;
  }> {
    try {
      const [clusterHealth, indexHealth, performance] = await Promise.all([
        this.elasticsearchService.cluster.health(),
        this.elasticsearchService.indices.stats({ index: this.INDEX_NAME }),
        this.getPerformanceMetrics(),
      ]);

      const isHealthy =
        clusterHealth.status !== 'red' && performance.searchLatency < 1000; // Less than 1 second

      return {
        status: isHealthy ? 'healthy' : 'degraded',
        cluster: {
          status: clusterHealth.status,
          numberOfNodes: clusterHealth.number_of_nodes,
          activeShards: clusterHealth.active_shards,
        },
        indexHealth: {
          documentCount:
            indexHealth.indices![this.INDEX_NAME]?.total?.docs?.count || 0,
          indexSize:
            indexHealth.indices![this.INDEX_NAME]?.total?.store
              ?.size_in_bytes || 0,
        },
        performance,
      };
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      return {
        status: 'unhealthy',
      };
    }
  }

  /**
   * Reindex all messages for a session
   */
  async reindexSession(sessionId: string): Promise<void> {
    try {
      // Delete existing documents for this session
      await this.elasticsearchService.deleteByQuery({
        index: this.INDEX_NAME,
        body: {
          query: {
            term: { sessionId },
          },
        } as Record<string, any>,
      });

      // Queue session for reindexing
      await this.indexingQueue.add(
        'reindex-session',
        { sessionId },
        {
          priority: 5,
          attempts: 2,
        },
      );
      const jobs = await this.indexingQueue.getWaiting();
      jobs.forEach((job) => {
        console.log(`Job ID: ${job.id}, Name: ${job.name}, Data:`, job.data);
      });

      this.logger.log(`Session ${sessionId} queued for reindexing`);
    } catch (error) {
      this.logger.error(`Failed to reindex session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean up old search data
   */
  async cleanupOldData(olderThanDays: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Delete old messages from main index
      await this.elasticsearchService.deleteByQuery({
        index: this.INDEX_NAME,
        body: {
          query: {
            range: {
              createdAt: {
                lt: cutoffDate,
              },
            },
          },
        } as Record<string, any>,
      });

      // Delete old suggestions
      await this.elasticsearchService.deleteByQuery({
        index: this.SUGGESTION_INDEX,
        body: {
          query: {
            range: {
              createdAt: {
                lt: cutoffDate,
              },
            },
          },
        } as Record<string, any>,
      });

      this.logger.log(
        `Cleaned up search data older than ${olderThanDays} days`,
      );
    } catch (error) {
      this.logger.error(`Cleanup failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get search statistics for monitoring
   */
  async getSearchStats(): Promise<{
    totalSearches: number;
    averageResponseTime: number;
    popularQueries: Array<{ query: string; count: number }>;
    errorRate: number;
  }> {
    // This would require implementing search query logging
    // For now, return placeholder data
    return {
      totalSearches: 0,
      averageResponseTime: 0,
      popularQueries: [],
      errorRate: 0,
    };
  }

  // Helper methods

  private getSentimentRange(sentiment: string): any {
    switch (sentiment) {
      case 'positive':
        return { gte: 0.1 };
      case 'negative':
        return { lte: -0.1 };
      case 'neutral':
        return { gte: -0.1, lte: 0.1 };
      default:
        return {};
    }
  }

  private formatSearchResponse(esResponse: any, query: string): SearchResponse {
    const hits = esResponse.hits.hits || [];
    const aggregations = esResponse.aggregations || {};

    const results: SearchResult[] = hits.map((hit: any) => ({
      id: hit._source.id,
      content: hit._source.content,
      sessionId: hit._source.sessionId,
      senderType: hit._source.senderType,
      senderId: hit._source.senderId,
      sentiment: hit._source.sentimentScore,
      createdAt: new Date(hit._source.createdAt),
      updatedAt: new Date(hit._source.updatedAt),
      relevanceScore: hit._score,
      highlights: hit.highlight?.content || [],
      contextSnippet: this.generateContextSnippet(hit._source.content, query),
    }));

    const facets = {
      senderTypes: this.formatTermsAggregation(aggregations.sender_types),
      sentiments: this.formatRangeAggregation(aggregations.sentiment_ranges),
      dates: this.formatDateHistogram(aggregations.date_histogram),
      sessions: this.formatTermsAggregation(aggregations.sessions),
    };

    return {
      results,
      total: esResponse.hits.total.value || 0,
      took: esResponse.took,
      query,
      facets,
    };
  }

  private generateContextSnippet(content: string, query: string): string {
    if (!query || !content) return content.substring(0, 150) + '...';

    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();

    // Find the first occurrence of any query term
    let firstMatchIndex = -1;
    for (const term of queryTerms) {
      const index = contentLower.indexOf(term);
      if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
        firstMatchIndex = index;
      }
    }

    if (firstMatchIndex === -1) {
      return content.substring(0, 150) + '...';
    }

    // Extract context around the match
    const start = Math.max(0, firstMatchIndex - 75);
    const end = Math.min(content.length, firstMatchIndex + 75);

    let snippet = content.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
  }

  private formatTermsAggregation(agg: any): Record<string, number> {
    if (!agg?.buckets) return {};
    return agg.buckets.reduce((acc: any, bucket: any) => {
      acc[bucket.key] = bucket.doc_count;
      return acc;
    }, {});
  }

  private formatRangeAggregation(agg: any): Record<string, number> {
    if (!agg?.buckets) return {};
    return agg.buckets.reduce((acc: any, bucket: any) => {
      acc[bucket.key] = bucket.doc_count;
      return acc;
    }, {});
  }

  private formatHistogramAggregation(agg: any): Record<string, number> {
    if (!agg?.buckets) return {};
    return agg.buckets.reduce((acc: any, bucket: any) => {
      acc[bucket.key.toString()] = bucket.doc_count;
      return acc;
    }, {});
  }

  private formatDateHistogram(agg: any): Record<string, number> {
    if (!agg?.buckets) return {};
    return agg.buckets.reduce((acc: any, bucket: any) => {
      acc[bucket.key_as_string] = bucket.doc_count;
      return acc;
    }, {});
  }
}
