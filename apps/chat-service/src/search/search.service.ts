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

interface SearchQuery {
  query: string;
  sessionId?: string;
  userId?: string;
  senderType?: 'user' | 'ai' | 'counselor';
  startDate?: Date;
  endDate?: Date;
  sentiment?: 'positive' | 'negative' | 'neutral';
  limit?: number;
  offset?: number;
}

interface SearchResult {
  id: string;
  content: string;
  sessionId: string;
  senderType: string;
  sentiment?: number;
  createdAt: Date;
  relevanceScore: number;
  highlights?: string[];
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  took: number;
  facets?: {
    senderTypes: Record<string, number>;
    sentiments: Record<string, number>;
    dates: Record<string, number>;
  };
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly INDEX_NAME = 'chat_messages';

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
  ) {
    this.initializeIndex();
  }

  /**
   * Initialize Elasticsearch index with proper mappings
   */
  private async initializeIndex(): Promise<void> {
    try {
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
                analyzer: 'standard',
                fields: {
                  keyword: { type: 'keyword' },
                  suggest: {
                    type: 'completion',
                    analyzer: 'simple',
                  },
                },
              },
              contentType: { type: 'keyword' },
              sentimentScore: { type: 'float' },
              isflagged: { type: 'boolean' },
              flagReason: { type: 'text' },
              embedding: {
                type: 'dense_vector',
                dims: 1536,
              },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
            },
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              analyzer: {
                mental_health_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: [
                    'lowercase',
                    'stop',
                    'stemmer',
                    'mental_health_synonyms',
                  ],
                },
              },
              filter: {
                mental_health_synonyms: {
                  type: 'synonym',
                  synonyms: [
                    'sad,depressed,down,blue',
                    'anxious,worried,nervous,stressed',
                    'angry,mad,furious,irritated',
                    'happy,joyful,glad,cheerful',
                  ],
                },
              },
            },
          },
        });

        this.logger.log('Elasticsearch index created successfully');
      }
    } catch (error) {
      this.logger.error(`Failed to initialize index: ${error.message}`);
    }
  }

  /**
   * Search messages with various filters and options
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
      } = searchQuery;

      const must: any[] = [];
      const filter: any[] = [];

      // Text search
      if (query) {
        must.push({
          multi_match: {
            query,
            fields: ['content^2', 'content.keyword'],
            type: 'best_fields',
            fuzziness: 'AUTO',
          },
        });
      }

      // Filters
      if (sessionId) {
        filter.push({ term: { sessionId } });
      }

      if (senderType) {
        filter.push({ term: { senderType } });
      }

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

      // Don't return flagged messages unless specifically requested
      filter.push({ term: { isFlagged: false } });

      const searchBody = {
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter,
          },
        },
        highlight: {
          fields: {
            content: {
              fragment_size: 150,
              number_of_fragments: 3,
            },
          },
        },
        sort: [{ _score: { order: 'desc' } }, { createdAt: { order: 'desc' } }],
        from: offset,
        size: limit,
        aggs: {
          sender_types: {
            terms: { field: 'senderType' },
          },
          sentiment_ranges: {
            range: {
              field: 'sentimentScore',
              ranges: [
                { key: 'negative', to: -0.1 },
                { key: 'neutral', from: -0.1, to: 0.1 },
                { key: 'positive', from: 0.1 },
              ],
            },
          },
          date_histogram: {
            date_histogram: {
              field: 'createdAt',
              calendar_interval: 'day',
            },
          },
        },
      };

      const response = await this.elasticsearchService.search({
        index: this.INDEX_NAME,
        body: searchBody as any,
      });

      return this.formatSearchResponse(response);
    } catch (error) {
      this.logger.error(`Search failed: ${error.message}`, error.stack);
      throw new Error('Search operation failed');
    }
  }

  /**
   * Semantic search using vector embeddings
   */
  async semanticSearch(
    query: string,
    sessionId?: string,
    limit: number = 10,
  ): Promise<SearchResponse> {
    try {
      // This would require generating embeddings for the query
      // For now, we'll fall back to text search
      this.logger.warn(
        'Semantic search not fully implemented, falling back to text search',
      );

      return this.searchMessages({
        query,
        sessionId,
        limit,
      });
    } catch (error) {
      this.logger.error(`Semantic search failed: ${error.message}`);
      throw new Error('Semantic search operation failed');
    }
  }

  /**
   * Get search suggestions for autocomplete
   */
  async getSuggestions(prefix: string, sessionId?: string): Promise<string[]> {
    try {
      const filter = sessionId ? [{ term: { sessionId } }] : [];

      const response = await this.elasticsearchService.search({
        index: this.INDEX_NAME,
        suggest: {
          content_suggest: {
            prefix,
            completion: {
              field: 'content.suggest',
              size: 10,
            },
          },
        },
        query: {
          bool: {
            filter,
          },
        },
      });

      const suggestions =
        (response as any).suggest?.content_suggest?.[0]?.options || [];
      return suggestions.map((option: any) => option.text);
    } catch (error) {
      this.logger.error(`Get suggestions failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Index a single message
   */
  async indexMessage(message: ChatMessage): Promise<void> {
    try {
      await this.elasticsearchService.index<Record<string, any>>({
        index: this.INDEX_NAME,
        id: message.id,
        document: {
          id: message.id,
          sessionId: message.sessionId,
          senderId: message.senderId,
          senderType: message.senderType,
          content: message.content,
          contentType: message.contentType,
          sentimentScore: message.sentimentScore,
          isFlagged: message.isFlagged,
          flagReason: message.flagReason,
          embedding: message.embedding,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
        },
      });

      this.logger.debug(`Message ${message.id} indexed successfully`);
    } catch (error) {
      this.logger.error(
        `Failed to index message ${message.id}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Queue message for indexing
   */
  async queueMessageForIndexing(messageId: string): Promise<void> {
    try {
      await this.indexingQueue.add(
        'index-message',
        { messageId },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue message for indexing: ${error.message}`,
      );
    }
  }

  /**
   * Bulk index messages
   */
  async bulkIndexMessages(messages: ChatMessage[]): Promise<void> {
    try {
      const body = messages.flatMap((message) => [
        { index: { _index: this.INDEX_NAME, _id: message.id } },
        {
          id: message.id,
          sessionId: message.sessionId,
          senderId: message.senderId,
          senderType: message.senderType,
          content: message.content,
          contentType: message.contentType,
          sentimentScore: message.sentimentScore,
          isFlagged: message.isFlagged,
          flagReason: message.flagReason,
          embedding: message.embedding,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
        },
      ]);

      await this.elasticsearchService.bulk({ body });
      this.logger.log(`Bulk indexed ${messages.length} messages`);
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
    } catch (error) {
      this.logger.error(
        `Failed to delete message from index: ${error.message}`,
      );
    }
  }

  /**
   * Get search analytics
   */
  async getSearchAnalytics(
    sessionId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    try {
      const filter: any[] = [];

      if (sessionId) {
        filter.push({ term: { sessionId } });
      }

      if (startDate || endDate) {
        const dateRange: any = {};
        if (startDate) dateRange.gte = startDate;
        if (endDate) dateRange.lte = endDate;
        filter.push({ range: { createdAt: dateRange } });
      }

      const response = await this.elasticsearchService.search({
        index: this.INDEX_NAME,

        size: 0,
        query: {
          bool: { filter },
        },
        aggs: {
          message_count_over_time: {
            date_histogram: {
              field: 'createdAt',
              calendar_interval: 'hour',
            },
            aggs: {
              sentiment_avg: {
                avg: { field: 'sentimentScore' },
              },
            },
          },
          sender_distribution: {
            terms: { field: 'senderType' },
          },
          sentiment_distribution: {
            histogram: {
              field: 'sentimentScore',
              interval: 0.2,
              min_doc_count: 1,
            },
          },
          top_keywords: {
            significant_text: {
              field: 'content',
              size: 10,
            },
          },
        },
      });

      return response.aggregations;
    } catch (error) {
      this.logger.error(`Analytics query failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Health check for search service
   */
  async healthCheck(): Promise<{ status: string; cluster?: any }> {
    try {
      const health = await this.elasticsearchService.cluster.health();
      return {
        status: 'healthy',
        cluster: health,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
      };
    }
  }

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

  private formatSearchResponse(esResponse: any): SearchResponse {
    const hits = esResponse.hits.hits || [];
    const aggregations = esResponse.aggregations || {};

    const results: SearchResult[] = hits.map((hit: any) => ({
      id: hit._source.id,
      content: hit._source.content,
      sessionId: hit._source.sessionId,
      senderType: hit._source.senderType,
      sentiment: hit._source.sentimentScore,
      createdAt: hit._source.createdAt,
      relevanceScore: hit._score,
      highlights: hit.highlight?.content || [],
    }));

    const facets = {
      senderTypes: this.formatTermsAggregation(aggregations.sender_types),
      sentiments: this.formatRangeAggregation(aggregations.sentiment_ranges),
      dates: this.formatDateHistogram(aggregations.date_histogram),
    };

    return {
      results,
      total: esResponse.hits.total.value || 0,
      took: esResponse.took,
      facets,
    };
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

  private formatDateHistogram(agg: any): Record<string, number> {
    if (!agg?.buckets) return {};
    return agg.buckets.reduce((acc: any, bucket: any) => {
      acc[bucket.key_as_string] = bucket.doc_count;
      return acc;
    }, {});
  }
}
