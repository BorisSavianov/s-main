// apps/mood-service/src/mood-ai/mood-ai.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { MoodEntry } from '../database/entities/mood-entry.entity';

interface OllamaRequest {
  model: string;
  prompt: string;
  stream: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
  };
}

interface OllamaResponse {
  response: string;
  done: boolean;
}

interface MoodAnalysisResult {
  insights: string[];
  patterns: string[];
  recommendations: string[];
}

@Injectable()
export class MoodAiService {
  private readonly logger = new Logger(MoodAiService.name);
  private readonly ollamaBaseUrl: string;
  private readonly defaultModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.ollamaBaseUrl = this.configService.get<string>(
      'OLLAMA_BASE_URL',
      'http://localhost:11434',
    );
    this.defaultModel = this.configService.get<string>(
      'OLLAMA_DEFAULT_MODEL',
      'llama3.1:8b',
    );
  }

  /**
   * Generate deep AI-driven insights from mood entries
   */
  async generateDeepAnalysis(
    userId: string,
    entries: MoodEntry[],
  ): Promise<MoodAnalysisResult> {
    try {
      if (entries.length < 3) {
        this.logger.warn(
          `Insufficient data for AI analysis (${entries.length} entries)`,
        );
        return {
          insights: [],
          patterns: [],
          recommendations: [],
        };
      }

      // Build a rich context from entries
      const context = this.buildMoodContext(entries);

      // Generate insights
      const insights = await this.generateInsights(context);

      // Identify patterns
      const patterns = await this.identifyPatterns(context);

      // Generate recommendations
      const recommendations = await this.generateRecommendations(context);

      this.logger.log(
        `Generated AI analysis for user ${userId}: ${insights.length} insights, ${patterns.length} patterns, ${recommendations.length} recommendations`,
      );

      return {
        insights,
        patterns,
        recommendations,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate deep analysis: ${error.message}`,
        error.stack,
      );
      return {
        insights: [],
        patterns: [],
        recommendations: [],
      };
    }
  }

  /**
   * Build context string from mood entries
   */
  private buildMoodContext(entries: MoodEntry[]): string {
    const contextParts = entries.map((entry, index) => {
      const date = new Date(entry.entryDate).toLocaleDateString();
      const parts = [
        `Entry ${index + 1} (${date}):`,
        `- Mood: ${entry.moodRating} (Rating: ${entry.rating}/5)`,
      ];

      if (entry.energyLevel !== undefined) {
        parts.push(`- Energy: ${entry.energyLevel}/5`);
      }
      if (entry.stressLevel !== undefined) {
        parts.push(`- Stress: ${entry.stressLevel}/5`);
      }
      if (entry.sleepHours !== undefined) {
        parts.push(`- Sleep: ${entry.sleepHours} hours`);
      }
      if (entry.exerciseMinutes !== undefined) {
        parts.push(`- Exercise: ${entry.exerciseMinutes} minutes`);
      }
      if (entry.notes) {
        parts.push(`- Notes: ${entry.notes}`);
      }
      if (entry.activities && entry.activities.length > 0) {
        parts.push(`- Activities: ${entry.activities.join(', ')}`);
      }
      if (entry.triggers && entry.triggers.length > 0) {
        parts.push(`- Triggers: ${entry.triggers.join(', ')}`);
      }

      return parts.join('\n');
    });

    return contextParts.join('\n\n');
  }

  /**
   * Generate insights using AI
   */
  private async generateInsights(context: string): Promise<string[]> {
    try {
      const prompt = `Analyze the following mood tracking data and provide 3-5 specific, actionable insights about the person's mental health patterns. Focus on concrete observations, not generic advice:

${context}

Provide insights in a numbered list format. Each insight should be one clear sentence.`;

      const response = await this.callOllama(prompt, { temperature: 0.4 });

      return this.parseListResponse(response.response);
    } catch (error) {
      this.logger.error(`Failed to generate insights: ${error.message}`);
      return [];
    }
  }

  /**
   * Identify patterns using AI
   */
  private async identifyPatterns(context: string): Promise<string[]> {
    try {
      const prompt = `Analyze the following mood tracking data and identify 2-4 significant patterns or correlations. Look for relationships between activities, sleep, exercise, stress levels, and mood:

${context}

List each pattern as a single clear sentence. Focus on cause-and-effect relationships.`;

      const response = await this.callOllama(prompt, { temperature: 0.3 });

      return this.parseListResponse(response.response);
    } catch (error) {
      this.logger.error(`Failed to identify patterns: ${error.message}`);
      return [];
    }
  }

  /**
   * Generate personalized recommendations
   */
  private async generateRecommendations(context: string): Promise<string[]> {
    try {
      const prompt = `Based on the following mood tracking data, suggest 3-5 specific, personalized recommendations to improve mental wellbeing. Make them actionable and tailored to the observed patterns:

${context}

Provide recommendations in a numbered list. Each should be specific and actionable.`;

      const response = await this.callOllama(prompt, { temperature: 0.5 });

      return this.parseListResponse(response.response);
    } catch (error) {
      this.logger.error(`Failed to generate recommendations: ${error.message}`);
      return [];
    }
  }

  /**
   * Call Ollama API
   */
  private async callOllama(
    prompt: string,
    options?: { temperature?: number; top_p?: number },
  ): Promise<OllamaResponse> {
    try {
      const requestData: OllamaRequest = {
        model: this.defaultModel,
        prompt,
        stream: false,
        options: {
          temperature: options?.temperature || 0.7,
          top_p: options?.top_p || 0.9,
        },
      };

      const response = await firstValueFrom(
        this.httpService.post<OllamaResponse>(
          `${this.ollamaBaseUrl}/api/generate`,
          requestData,
          {
            timeout: 120000, // 60 seconds for complex analysis
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Ollama API call failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse numbered or bulleted list from AI response
   */
  private parseListResponse(response: string): string[] {
    return response
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        // Remove numbering (1., 2., etc.) or bullets (-, *, •)
        return line.replace(/^[\d]+\.\s*/, '').replace(/^[-*•]\s*/, '');
      })
      .filter((line) => line.length > 10) // Filter out very short lines
      .slice(0, 5); // Limit to 5 items
  }
}
