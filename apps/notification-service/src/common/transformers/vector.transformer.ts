// apps/chat-service/src/common/transformers/vector.transformer.ts

import { ValueTransformer } from 'typeorm';

/**
 * Custom transformer for handling PostgreSQL vector types in TypeORM
 * Converts between number[] (TypeScript) and vector format (PostgreSQL)
 */
export class VectorTransformer implements ValueTransformer {
  /**
   * Transform number array to PostgreSQL vector format for database storage
   */
  to(value: number[] | null): string | null {
    if (!value || !Array.isArray(value)) {
      return null;
    }

    // Validate that all values are numbers
    if (!value.every((v) => typeof v === 'number' && !isNaN(v))) {
      throw new Error('Vector array must contain only valid numbers');
    }

    return `[${value.join(',')}]`;
  }

  /**
   * Transform PostgreSQL vector format to number array for TypeScript usage
   */
  from(value: string | null): number[] | null {
    if (!value) {
      return null;
    }

    try {
      // Handle PostgreSQL vector format: [1,2,3,...]
      if (value.startsWith('[') && value.endsWith(']')) {
        const cleanValue = value.slice(1, -1);
        if (!cleanValue.trim()) {
          return [];
        }
        return cleanValue.split(',').map((v) => {
          const num = parseFloat(v.trim());
          if (isNaN(num)) {
            throw new Error(`Invalid number in vector: ${v}`);
          }
          return num;
        });
      }

      // Handle comma-separated format: 1,2,3,...
      if (value.includes(',')) {
        return value.split(',').map((v) => {
          const num = parseFloat(v.trim());
          if (isNaN(num)) {
            throw new Error(`Invalid number in vector: ${v}`);
          }
          return num;
        });
      }

      // Handle single number
      const num = parseFloat(value);
      if (isNaN(num)) {
        throw new Error(`Invalid vector format: ${value}`);
      }
      return [num];
    } catch (error) {
      console.error(`Failed to parse vector value: ${value}`, error);
      return null;
    }
  }
}

// Export singleton instance
export const vectorTransformer = new VectorTransformer();

// Helper functions for vector operations
export class VectorUtils {
  /**
   * Calculate cosine similarity between two vectors
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Calculate Euclidean distance between two vectors
   */
  static euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }

  /**
   * Normalize a vector to unit length
   */
  static normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0),
    );
    return magnitude === 0 ? vector : vector.map((val) => val / magnitude);
  }

  /**
   * Validate vector format for PostgreSQL
   */
  static validateVector(vector: any): vector is number[] {
    return (
      Array.isArray(vector) &&
      vector.every((v) => typeof v === 'number' && !isNaN(v))
    );
  }

  /**
   * Create a PostgreSQL vector string from number array
   */
  static toPostgresVector(vector: number[]): string {
    if (!this.validateVector(vector)) {
      throw new Error('Invalid vector format');
    }
    return `[${vector.join(',')}]`;
  }
}
