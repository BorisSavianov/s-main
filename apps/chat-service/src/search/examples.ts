// Example usage of the complete search service implementation
// apps/chat-service/src/search/examples/search-integration.example.ts

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SearchService } from './search.service';

@Injectable()
export class SearchIntegrationExample {
  private readonly logger = new Logger(SearchIntegrationExample.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Example 1: Basic text search
   */
  async performBasicSearch() {
    try {
      const results = await this.searchService.searchMessages({
        query: 'anxiety depression',
        limit: 10,
        includeHighlights: true,
        includeFacets: true,
      });

      this.logger.log(`Found ${results.total} messages in ${results.took}ms`);

      // Emit analytics event
      this.eventEmitter.emit('search.query.performed', {
        query: 'anxiety depression',
        resultCount: results.total,
        executionTime: results.took,
        searchType: 'text',
      });

      return results;
    } catch (error) {
      this.logger.error(`Basic search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Example 2: Semantic search for similar messages
   */
  async performSemanticSearch() {
    try {
      const results = await this.searchService.semanticSearch(
        'I am feeling overwhelmed and stressed',
        undefined, // No session filter
        15,
        0.75, // High similarity threshold
      );

      this.logger.log(
        `Semantic search found ${results.total} similar messages`,
      );

      // Log semantic similarities
      results.results.forEach((result, index) => {
        this.logger.debug(
          `Result ${index + 1}: ${result.semanticScore.toFixed(3)} similarity - "${result.content.substring(0, 100)}..."`,
        );
      });

      return results;
    } catch (error) {
      this.logger.error(`Semantic search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Example 3: Hybrid search combining text and semantic
   */
  async performHybridSearch() {
    try {
      const results = await this.searchService.hybridSearch(
        'sleep problems insomnia',
        undefined,
        20,
        0.6, // Text weight
        0.4, // Semantic weight
      );

      this.logger.log(`Hybrid search found ${results.total} messages`);

      // Show combined scoring
      results.results.slice(0, 5).forEach((result, index) => {
        this.logger.debug(
          `Hybrid result ${index + 1}: ${result.relevanceScore.toFixed(3)} combined score`,
        );
      });

      return results;
    } catch (error) {
      this.logger.error(`Hybrid search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Example 4: Advanced filtered search
   */
  async performAdvancedSearch() {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const results = await this.searchService.searchMessages({
        query: 'therapy counseling help',
        senderType: 'user',
        sentiment: 'negative',
        startDate: oneWeekAgo,
        limit: 25,
        includeHighlights: true,
        includeFacets: true,
      });

      this.logger.log(
        `Advanced search: ${results.total} user messages with negative sentiment about therapy in the last week`,
      );

      // Analyze facets
      if (results.facets) {
        this.logger.debug('Sentiment distribution:', results.facets.sentiments);
        this.logger.debug(
          'Date distribution:',
          Object.keys(results.facets.dates).length + ' different days',
        );
      }

      return results;
    } catch (error) {
      this.logger.error(`Advanced search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Example 5: Get search suggestions
   */
  async getSearchSuggestions() {
    try {
      const suggestions = await this.searchService.getSuggestions(
        'anx',
        undefined,
        10,
      );

      this.logger.log(`Got ${suggestions.length} suggestions for "anx"`);

      suggestions.forEach((suggestion, index) => {
        this.logger.debug(
          `Suggestion ${index + 1}: "${suggestion.text}" (${suggestion.type}, score: ${suggestion.score.toFixed(2)})`,
        );
      });

      return suggestions;
    } catch (error) {
      this.logger.error(`Get suggestions failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Example 6: Session-specific search
   */
  async searchWithinSession(sessionId: string) {
    try {
      const [textResults, semanticResults, suggestions] = await Promise.all([
        // Text search within session
        this.searchService.searchMessages({
          query: 'mood feelings',
          sessionId,
          limit: 20,
        }),

        // Semantic search within session
        this.searchService.semanticSearch('emotional state', sessionId, 10),

        // Session-specific suggestions
        this.searchService.getSuggestions('feel', sessionId, 5),
      ]);

      this.logger.log(`Session ${sessionId} search results:`);
      this.logger.log(`- Text search: ${textResults.total} messages`);
      this.logger.log(`- Semantic search: ${semanticResults.total} messages`);
      this.logger.log(`- Suggestions: ${suggestions.length} items`);

      return {
        textResults,
        semanticResults,
        suggestions,
      };
    } catch (error) {
      this.logger.error(`Session search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Example 7: Get comprehensive analytics
   */
  async getSearchAnalytics() {
    try {
      const analytics = await this.searchService.getSearchAnalytics();

      this.logger.log('Search Analytics Summary:');
      this.logger.log(`- Total messages: ${analytics.totalMessages}`);
      this.logger.log(
        `- Average sentiment: ${analytics.averageSentiment.toFixed(3)}`,
      );
      this.logger.log(
        `- Top keywords: ${analytics.topKeywords
          .slice(0, 5)
          .map((k) => k.keyword)
          .join(', ')}`,
      );
      this.logger.log(
        `- Message activity: ${analytics.messagesByHour.length} hours of data`,
      );

      // Analyze sentiment trends
      const positiveKeywords = analytics.topKeywords.filter(
        (k) => k.sentiment > 0.1,
      );
      const negativeKeywords = analytics.topKeywords.filter(
        (k) => k.sentiment < -0.1,
      );

      this.logger.log(
        `- Positive keywords: ${positiveKeywords.map((k) => k.keyword).join(', ')}`,
      );
      this.logger.log(
        `- Negative keywords: ${negativeKeywords.map((k) => k.keyword).join(', ')}`,
      );

      return analytics;
    } catch (error) {
      this.logger.error(`Analytics retrieval failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Example 8: Performance monitoring
   */
  async monitorSearchPerformance() {
    try {
      const [health, performance, stats] = await Promise.all([
        this.searchService.healthCheck(),
        this.searchService.getPerformanceMetrics(),
        this.searchService.getSearchStats(),
      ]);

      this.logger.log('Search Service Status:');
      this.logger.log(`- Health: ${health.status}`);
      this.logger.log(
        `- Documents: ${performance.documentCount.toLocaleString()}`,
      );
      this.logger.log(
        `- Index size: ${(performance.indexSize / 1024 / 1024).toFixed(2)} MB`,
      );
      this.logger.log(`- Search latency: ${performance.searchLatency}ms`);
      this.logger.log(`- Cache hit ratio: ${performance.cacheHitRatio}%`);

      // Check for performance issues
      if (performance.searchLatency > 1000) {
        this.logger.warn('Search latency is high - consider optimization');

        // Emit performance degradation event
        this.eventEmitter.emit('search.performance.degraded', {
          averageLatency: performance.searchLatency,
          errorRate: 0, // Would calculate from actual error metrics
          threshold: 1000,
        });
      }

      return { health, performance, stats };
    } catch (error) {
      this.logger.error(`Performance monitoring failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Example 9: Batch operations
   */
  async performBatchOperations(sessionId: string) {
    try {
      // Trigger session reindexing
      await this.searchService.reindexSession(sessionId);
      this.logger.log(`Queued reindexing for session ${sessionId}`);

      // Trigger batch embedding generation
      this.eventEmitter.emit('embedding.batch.requested', {
        sessionIds: [sessionId],
        priority: 1,
      });
      this.logger.log(
        `Requested batch embedding generation for session ${sessionId}`,
      );

      // Schedule cleanup
      this.eventEmitter.emit('system.maintenance.scheduled', {
        type: 'cleanup',
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      });
      this.logger.log('Scheduled maintenance cleanup');

      return { success: true };
    } catch (error) {
      this.logger.error(`Batch operations failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Example 10: Error handling and fallbacks
   */
  async searchWithFallback(query: string) {
    try {
      // Try semantic search first
      const semanticResults = await this.searchService.semanticSearch(
        query,
        undefined,
        10,
      );

      if (semanticResults.total > 0) {
        this.logger.log('Using semantic search results');
        return { results: semanticResults.results, type: 'semantic' };
      }
    } catch (error) {
      this.logger.warn(
        `Semantic search failed, falling back to text search: ${error.message}`,
      );
    }

    try {
      // Fallback to text search
      const textResults = await this.searchService.searchMessages({
        query,
        limit: 10,
        includeFacets: false,
      });

      this.logger.log('Using text search results');
      return { results: textResults.results, type: 'text' };
    } catch (error) {
      this.logger.error(`All search methods failed: ${error.message}`);

      // Ultimate fallback - return empty results
      return { results: [], type: 'fallback' };
    }
  }

  /**
   * Example 11: Real-time search with event integration
   */
  async setupRealTimeSearch(sessionId: string) {
    // Listen for new messages in the session
    this.eventEmitter.on('message.sent', async (event) => {
      if (event.sessionId === sessionId) {
        // Perform automatic semantic search for related content
        try {
          const relatedMessages = await this.searchService.semanticSearch(
            event.content,
            sessionId,
            5,
            0.8,
          );

          if (relatedMessages.total > 0) {
            this.logger.log(
              `Found ${relatedMessages.total} related messages for new message in session ${sessionId}`,
            );

            // Could emit event to notify frontend of related content
            this.eventEmitter.emit('search.related.found', {
              sessionId,
              messageId: event.messageId,
              relatedMessages: relatedMessages.results,
            });
          }
        } catch (error) {
          this.logger.error(`Real-time search failed: ${error.message}`);
        }
      }
    });

    this.logger.log(
      `Set up real-time search monitoring for session ${sessionId}`,
    );
  }

  /**
   * Example 12: Search result export
   */
  async exportSearchResults(query: string, format: 'json' | 'csv' = 'json') {
    try {
      const results = await this.searchService.searchMessages({
        query,
        limit: 1000, // Large limit for export
        includeFacets: false,
        includeHighlights: false,
      });

      if (format === 'csv') {
        const csvData = this.convertToCSV(results.results);
        this.logger.log(
          `Exported ${results.results.length} search results as CSV`,
        );
        return csvData;
      }

      this.logger.log(
        `Exported ${results.results.length} search results as JSON`,
      );
      return {
        query,
        totalResults: results.total,
        exportedAt: new Date().toISOString(),
        results: results.results,
      };
    } catch (error) {
      this.logger.error(`Search export failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Helper method to convert search results to CSV
   */
  private convertToCSV(results: any[]): string {
    if (results.length === 0) return '';

    const headers = [
      'id',
      'content',
      'sessionId',
      'senderType',
      'sentiment',
      'createdAt',
      'relevanceScore',
    ];
    const csvRows = [headers.join(',')];

    results.forEach((result) => {
      const row = [
        result.id,
        `"${result.content.replace(/"/g, '""')}"`, // Escape quotes
        result.sessionId,
        result.senderType,
        result.sentiment || '',
        result.createdAt.toISOString(),
        result.relevanceScore,
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }
}

// Example usage in a controller or service
export class ExampleUsageController {
  constructor(private readonly searchExample: SearchIntegrationExample) {}

  async demonstrateSearchCapabilities() {
    const example = this.searchExample;

    try {
      // 1. Basic search operations
      console.log('=== Basic Search Operations ===');
      await example.performBasicSearch();
      await example.performSemanticSearch();
      await example.performHybridSearch();

      // 2. Advanced filtering
      console.log('\n=== Advanced Search Features ===');
      await example.performAdvancedSearch();
      await example.getSearchSuggestions();

      // 3. Session-specific operations
      console.log('\n=== Session-Specific Search ===');
      const sessionId = 'example-session-123';
      await example.searchWithinSession(sessionId);
      await example.setupRealTimeSearch(sessionId);

      // 4. Analytics and monitoring
      console.log('\n=== Analytics and Monitoring ===');
      await example.getSearchAnalytics();
      await example.monitorSearchPerformance();

      // 5. Administrative operations
      console.log('\n=== Administrative Operations ===');
      await example.performBatchOperations(sessionId);

      // 6. Error handling and fallbacks
      console.log('\n=== Error Handling ===');
      await example.searchWithFallback('complex query that might fail');

      // 7. Export functionality
      console.log('\n=== Export Functionality ===');
      await example.exportSearchResults('mental health support', 'json');

      console.log('\n=== Search Service Demo Complete ===');
    } catch (error) {
      console.error('Demo failed:', error.message);
    }
  }
}

// Configuration example for different environments
export const searchEnvironmentConfigs = {
  development: {
    ELASTICSEARCH_URL: 'http://localhost:9200',
    SEARCH_INDEX_PREFIX: 'dev_chat_',
    SEARCH_BATCH_SIZE: 50,
    EMBEDDING_DIMENSIONS: 768,
    MAX_SEARCH_RESULTS: 100,
    ENABLE_SEMANTIC_SEARCH: true,
    ENABLE_SEARCH_ANALYTICS: true,
    SEARCH_CLEANUP_INTERVAL_DAYS: 30,
  },

  staging: {
    ELASTICSEARCH_URL: 'https://staging-elasticsearch:9200',
    ELASTICSEARCH_USERNAME: 'elastic',
    ELASTICSEARCH_PASSWORD: 'staging-password',
    SEARCH_INDEX_PREFIX: 'staging_chat_',
    SEARCH_BATCH_SIZE: 100,
    EMBEDDING_DIMENSIONS: 768,
    MAX_SEARCH_RESULTS: 200,
    ENABLE_SEMANTIC_SEARCH: true,
    ENABLE_SEARCH_ANALYTICS: true,
    SEARCH_CLEANUP_INTERVAL_DAYS: 60,
  },

  production: {
    ELASTICSEARCH_URL: 'https://prod-elasticsearch-cluster:9200',
    ELASTICSEARCH_USERNAME: 'elastic',
    ELASTICSEARCH_PASSWORD: process.env.ELASTICSEARCH_PASSWORD,
    SEARCH_INDEX_PREFIX: 'prod_chat_',
    SEARCH_BATCH_SIZE: 200,
    EMBEDDING_DIMENSIONS: 768,
    MAX_SEARCH_RESULTS: 500,
    ENABLE_SEMANTIC_SEARCH: true,
    ENABLE_SEARCH_ANALYTICS: true,
    SEARCH_CLEANUP_INTERVAL_DAYS: 90,
    // Production-specific settings
    SEARCH_TIMEOUT: 15000,
    ELASTICSEARCH_MAX_RETRIES: 5,
    ELASTICSEARCH_REQUEST_TIMEOUT: 30000,
  },
};

// Testing utilities
export class SearchTestUtils {
  constructor(private readonly searchService: SearchService) {}

  /**
   * Create test data for search functionality
   */
  async createTestData() {
    const testMessages = [
      {
        id: 'test-1',
        sessionId: 'test-session-1',
        content: 'I am feeling very anxious about my upcoming presentation',
        senderType: 'user' as const,
        sentimentScore: -0.6,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      },
      {
        id: 'test-2',
        sessionId: 'test-session-1',
        content:
          'It sounds like you are experiencing presentation anxiety. This is very common.',
        senderType: 'ai' as const,
        sentimentScore: 0.2,
        createdAt: new Date('2024-01-01T10:01:00Z'),
      },
      {
        id: 'test-3',
        sessionId: 'test-session-2',
        content:
          'I have been having trouble sleeping lately. I keep waking up at 3 AM.',
        senderType: 'user' as const,
        sentimentScore: -0.4,
        createdAt: new Date('2024-01-02T22:00:00Z'),
      },
      {
        id: 'test-4',
        sessionId: 'test-session-2',
        content:
          'Sleep disruption can be related to stress or anxiety. Have you noticed any patterns?',
        senderType: 'ai' as const,
        sentimentScore: 0.1,
        createdAt: new Date('2024-01-02T22:01:00Z'),
      },
      {
        id: 'test-5',
        sessionId: 'test-session-3',
        content:
          'I feel much better after our last conversation. Thank you for the coping strategies.',
        senderType: 'user' as const,
        sentimentScore: 0.8,
        createdAt: new Date('2024-01-03T14:00:00Z'),
      },
    ];

    // Index test messages
    for (const message of testMessages) {
      await this.searchService.indexMessage(message as any, true);
    }

    console.log(
      `Created ${testMessages.length} test messages for search testing`,
    );
    return testMessages;
  }

  /**
   * Run comprehensive search tests
   */
  async runSearchTests() {
    const tests = [
      {
        name: 'Text Search - Anxiety',
        test: () =>
          this.searchService.searchMessages({ query: 'anxiety', limit: 10 }),
        expectedMinResults: 1,
      },
      {
        name: 'Semantic Search - Sleep Issues',
        test: () =>
          this.searchService.semanticSearch('sleep problems', undefined, 5),
        expectedMinResults: 1,
      },
      {
        name: 'Sentiment Filter - Positive',
        test: () =>
          this.searchService.searchMessages({
            query: '',
            sentiment: 'positive',
            limit: 10,
          }),
        expectedMinResults: 1,
      },
      {
        name: 'Session Filter',
        test: () =>
          this.searchService.searchMessages({
            query: '',
            sessionId: 'test-session-1',
            limit: 10,
          }),
        expectedMinResults: 2,
      },
      {
        name: 'Date Range Filter',
        test: () =>
          this.searchService.searchMessages({
            query: '',
            startDate: new Date('2024-01-02T00:00:00Z'),
            endDate: new Date('2024-01-02T23:59:59Z'),
            limit: 10,
          }),
        expectedMinResults: 2,
      },
    ];

    const results = [] as Record<string, any>;
    for (const testCase of tests) {
      try {
        const result = await testCase.test();
        const passed = result.total >= testCase.expectedMinResults;

        results.push({
          name: testCase.name,
          passed,
          resultCount: result.total,
          expectedMin: testCase.expectedMinResults,
        });

        console.log(
          `✅ ${testCase.name}: ${result.total} results (expected >= ${testCase.expectedMinResults})`,
        );
      } catch (error) {
        results.push({
          name: testCase.name,
          passed: false,
          error: error.message,
        });

        console.log(`❌ ${testCase.name}: Failed - ${error.message}`);
      }
    }

    const passedTests = results.filter((r) => r.passed).length;
    console.log(
      `\nTest Summary: ${passedTests}/${results.length} tests passed`,
    );

    return results;
  }

  /**
   * Performance benchmark tests
   */
  async runPerformanceTests() {
    const benchmarks = [
      {
        name: 'Text Search Performance',
        test: () =>
          this.searchService.searchMessages({
            query: 'anxiety depression stress',
            limit: 50,
          }),
        maxExpectedTime: 1000, // 1 second
      },
      {
        name: 'Semantic Search Performance',
        test: () =>
          this.searchService.semanticSearch(
            'feeling overwhelmed',
            undefined,
            20,
          ),
        maxExpectedTime: 2000, // 2 seconds
      },
      {
        name: 'Complex Filter Performance',
        test: () =>
          this.searchService.searchMessages({
            query: 'therapy counseling',
            senderType: 'user',
            sentiment: 'negative',
            startDate: new Date('2024-01-01T00:00:00Z'),
            limit: 100,
            includeFacets: true,
          }),
        maxExpectedTime: 1500, // 1.5 seconds
      },
    ];

    const results = [] as Record<string, any>;
    for (const benchmark of benchmarks) {
      const iterations = 3;
      const times = [] as number[];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        try {
          await benchmark.test();
          times.push(Date.now() - start);
        } catch (error) {
          console.log(
            `❌ ${benchmark.name} iteration ${i + 1} failed: ${error.message}`,
          );
        }
      }

      if (times.length > 0) {
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const passed = avgTime <= benchmark.maxExpectedTime;

        results.push({
          name: benchmark.name,
          passed,
          averageTime: avgTime,
          maxTime: Math.max(...times),
          minTime: Math.min(...times),
          expectedMaxTime: benchmark.maxExpectedTime,
        });

        console.log(
          `${passed ? '✅' : '❌'} ${benchmark.name}: ${avgTime.toFixed(0)}ms avg (max: ${benchmark.maxExpectedTime}ms)`,
        );
      }
    }

    return results;
  }

  /**
   * Cleanup test data
   */
  async cleanupTestData() {
    const testIds = ['test-1', 'test-2', 'test-3', 'test-4', 'test-5'];

    for (const id of testIds) {
      try {
        await this.searchService.deleteMessage(id);
      } catch (error) {
        // Ignore errors for cleanup
      }
    }

    console.log('Cleaned up test data');
  }
}
