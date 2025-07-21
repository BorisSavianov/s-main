// src/auth/password.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly saltRounds = 12;

  async hashPassword(password: string): Promise<string> {
    try {
      const salt = await bcrypt.genSalt(this.saltRounds);
      const hash = await bcrypt.hash(password, salt);
      return hash;
    } catch (error) {
      this.logger.error('Error hashing password', error);
      throw new Error('Password hashing failed');
    }
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      this.logger.error('Error verifying password', error);
      return false;
    }
  }

  generateRandomPassword(length: number = 12): string {
    const charset =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';

    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return password;
  }

  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  validatePasswordStrength(password: string): {
    isValid: boolean;
    score: number;
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;

    // Check length
    if (password.length < 8) {
      feedback.push('Password must be at least 8 characters long');
    } else if (password.length >= 8) {
      score += 1;
    }

    if (password.length >= 12) {
      score += 1;
    }

    // Check for lowercase letters
    if (!/[a-z]/.test(password)) {
      feedback.push('Password must contain at least one lowercase letter');
    } else {
      score += 1;
    }

    // Check for uppercase letters
    if (!/[A-Z]/.test(password)) {
      feedback.push('Password must contain at least one uppercase letter');
    } else {
      score += 1;
    }

    // Check for numbers
    if (!/\d/.test(password)) {
      feedback.push('Password must contain at least one number');
    } else {
      score += 1;
    }

    // Check for special characters
    if (!/[@$!%*?&]/.test(password)) {
      feedback.push(
        'Password must contain at least one special character (@$!%*?&)',
      );
    } else {
      score += 1;
    }

    // Check for common patterns
    if (/(.)\1{2,}/.test(password)) {
      feedback.push('Password should not contain repeated characters');
      score -= 1;
    }

    if (/123456|password|qwerty|abc123/i.test(password)) {
      feedback.push('Password should not contain common patterns');
      score -= 2;
    }

    // Check for dictionary words (simplified)
    const commonWords = [
      'password',
      'admin',
      'user',
      'login',
      'welcome',
      'secret',
    ];
    if (commonWords.some((word) => password.toLowerCase().includes(word))) {
      feedback.push('Password should not contain common words');
      score -= 1;
    }

    const isValid = feedback.length === 0 && score >= 4;

    return {
      isValid,
      score: Math.max(0, Math.min(5, score)),
      feedback,
    };
  }

  async isPasswordCompromised(password: string): Promise<boolean> {
    // This would typically check against a database of compromised passwords
    // For now, we'll check against a simple list of common passwords
    const commonPasswords = [
      'password',
      '123456',
      'password123',
      'admin',
      'qwerty',
      'letmein',
      'welcome',
      'monkey',
      '1234567890',
      'abc123',
    ];

    return commonPasswords.includes(password.toLowerCase());
  }

  generatePasswordResetToken(): string {
    return this.generateSecureToken(32);
  }

  generateEmailVerificationToken(): string {
    return this.generateSecureToken(32);
  }

  async hashPasswordWithCustomSalt(
    password: string,
    salt: string,
  ): Promise<string> {
    try {
      const hash = await bcrypt.hash(password, salt);
      return hash;
    } catch (error) {
      this.logger.error('Error hashing password with custom salt', error);
      throw new Error('Password hashing failed');
    }
  }

  generateSalt(): string {
    return bcrypt.genSaltSync(this.saltRounds);
  }

  async timingSafeCompare(a: string, b: string): Promise<boolean> {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }
}
