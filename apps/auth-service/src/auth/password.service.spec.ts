import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from './password.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

jest.mock('bcrypt');
jest.mock('crypto');

describe('PasswordService', () => {
  let service: PasswordService;
  let bcryptSpy: jest.Mocked<typeof bcrypt>;
  let cryptoSpy: jest.Mocked<typeof crypto>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordService],
    }).compile();

    service = module.get<PasswordService>(PasswordService);

    bcryptSpy = bcrypt as jest.Mocked<typeof bcrypt>;
    cryptoSpy = crypto as jest.Mocked<typeof crypto>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('should hash password successfully', async () => {
      const password = 'testPassword123';
      const salt = 'mockedSalt';
      const hashedPassword = 'hashedPassword';

      (bcryptSpy.genSalt as jest.Mock).mockResolvedValue(salt);
      (bcryptSpy.hash as jest.Mock).mockResolvedValue(hashedPassword);

      const result = await service.hashPassword(password);

      expect(bcryptSpy.genSalt).toHaveBeenCalledWith(12);
      expect(bcryptSpy.hash).toHaveBeenCalledWith(password, salt);
      expect(result).toBe(hashedPassword);
    });

    it('should throw error when bcrypt.genSalt fails', async () => {
      const password = 'testPassword123';
      (bcryptSpy.genSalt as jest.Mock).mockRejectedValue(
        new Error('Salt generation failed'),
      );

      await expect(service.hashPassword(password)).rejects.toThrow(
        'Password hashing failed',
      );
      expect(bcryptSpy.genSalt).toHaveBeenCalledWith(12);
    });

    it('should throw error when bcrypt.hash fails', async () => {
      const password = 'testPassword123';
      const salt = 'mockedSalt';

      (bcryptSpy.genSalt as jest.Mock).mockResolvedValue(salt);
      (bcryptSpy.hash as jest.Mock).mockRejectedValue(
        new Error('Hashing failed'),
      );

      await expect(service.hashPassword(password)).rejects.toThrow(
        'Password hashing failed',
      );
      expect(bcryptSpy.hash).toHaveBeenCalledWith(password, salt);
    });
  });

  describe('verifyPassword', () => {
    it('should verify password successfully when password matches', async () => {
      const password = 'testPassword123';
      const hash = 'hashedPassword';

      (bcryptSpy.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.verifyPassword(password, hash);

      expect(bcryptSpy.compare).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(true);
    });

    it('should return false when password does not match', async () => {
      const password = 'testPassword123';
      const hash = 'hashedPassword';

      (bcryptSpy.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.verifyPassword(password, hash);

      expect(bcryptSpy.compare).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(false);
    });

    it('should return false when bcrypt.compare throws error', async () => {
      const password = 'testPassword123';
      const hash = 'hashedPassword';

      (bcryptSpy.compare as jest.Mock).mockRejectedValue(
        new Error('Comparison failed'),
      );

      const result = await service.verifyPassword(password, hash);

      expect(bcryptSpy.compare).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(false);
    });
  });

  describe('generateRandomPassword', () => {
    beforeEach(() => {
      // Mock Math.random to return predictable values
      jest.spyOn(Math, 'random').mockImplementation(() => 0.5);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should generate password with default length of 12', () => {
      const result = service.generateRandomPassword();

      expect(result).toHaveLength(12);
      expect(typeof result).toBe('string');
    });

    it('should generate password with custom length', () => {
      const length = 16;
      const result = service.generateRandomPassword(length);

      expect(result).toHaveLength(length);
      expect(typeof result).toBe('string');
    });

    it('should generate password with valid characters', () => {
      const result = service.generateRandomPassword(8);
      const validCharset = /^[a-zA-Z0-9!@#$%^&*]*$/;

      expect(validCharset.test(result)).toBe(true);
    });
  });

  describe('generateSecureToken', () => {
    it('should generate secure token with default length', () => {
      const mockBuffer = Buffer.from('mockRandomBytes', 'utf8');
      const expectedHex = mockBuffer.toString('hex');

      (cryptoSpy.randomBytes as jest.Mock).mockReturnValue(mockBuffer);

      const result = service.generateSecureToken();

      expect(cryptoSpy.randomBytes).toHaveBeenCalledWith(32);
      expect(result).toBe(expectedHex);
    });

    it('should generate secure token with custom length', () => {
      const length = 16;
      const mockBuffer = Buffer.from('mockBytes', 'utf8');
      const expectedHex = mockBuffer.toString('hex');

      (cryptoSpy.randomBytes as jest.Mock).mockReturnValue(mockBuffer);

      const result = service.generateSecureToken(length);

      expect(cryptoSpy.randomBytes).toHaveBeenCalledWith(length);
      expect(result).toBe(expectedHex);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should validate strong password successfully', () => {
      const strongPassword = 'StrongP@ssw0rd123';

      const result = service.validatePasswordStrength(strongPassword);

      expect(result.isValid).toBe(true);
      expect(result.score).toBe(5);
      expect(result.feedback).toHaveLength(0);
    });

    it('should reject password that is too short', () => {
      const shortPassword = 'Sh0rt!';

      const result = service.validatePasswordStrength(shortPassword);

      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain(
        'Password must be at least 8 characters long',
      );
    });

    it('should reject password without lowercase letters', () => {
      const password = 'PASSWORD123!';

      const result = service.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain(
        'Password must contain at least one lowercase letter',
      );
    });

    it('should reject password without uppercase letters', () => {
      const password = 'password123!';

      const result = service.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain(
        'Password must contain at least one uppercase letter',
      );
    });

    it('should reject password without numbers', () => {
      const password = 'Password!';

      const result = service.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain(
        'Password must contain at least one number',
      );
    });

    it('should reject password without special characters', () => {
      const password = 'Password123';

      const result = service.validatePasswordStrength(password);

      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain(
        'Password must contain at least one special character (@$!%*?&)',
      );
    });

    it('should penalize password with repeated characters', () => {
      const password = 'Passsssword123!';

      const result = service.validatePasswordStrength(password);

      expect(result.feedback).toContain(
        'Password should not contain repeated characters',
      );
      expect(result.score).toBeLessThan(6);
    });

    it('should penalize password with common patterns', () => {
      const password = 'Password123456!';

      const result = service.validatePasswordStrength(password);

      expect(result.feedback).toContain(
        'Password should not contain common patterns',
      );
      expect(result.score).toBeLessThan(4);
    });

    it('should penalize password with common words', () => {
      const password = 'MyPassword123!';

      const result = service.validatePasswordStrength(password);

      expect(result.feedback).toContain(
        'Password should not contain common words',
      );
      expect(result.score).toBeLessThan(5);
    });

    it('should handle password with multiple issues', () => {
      const weakPassword = 'pass';

      const result = service.validatePasswordStrength(weakPassword);

      expect(result.isValid).toBe(false);
      expect(result.feedback.length).toBeGreaterThan(1);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should give extra points for longer passwords', () => {
      const longPassword = 'VeryLongStrongS3cur3!@#456';

      const result = service.validatePasswordStrength(longPassword);

      expect(result.score).toBeGreaterThanOrEqual(4);
      expect(result.isValid).toBe(true);
    });

    it('should cap score at maximum of 5', () => {
      const password = 'ExtremelyLongAndStrongS3cur3!@#123456789';

      const result = service.validatePasswordStrength(password);

      expect(result.score).toBeLessThanOrEqual(5);
    });

    it('should ensure minimum score of 0', () => {
      const terriblePassword = 'passwordpasswordpassword';

      const result = service.validatePasswordStrength(terriblePassword);

      expect(result.score).toBe(0);
    });
  });

  describe('isPasswordCompromised', () => {
    it('should detect compromised password', async () => {
      const compromisedPassword = 'password';

      const result = await service.isPasswordCompromised(compromisedPassword);

      expect(result).toBe(true);
    });

    it('should detect compromised password with different case', async () => {
      const compromisedPassword = 'PASSWORD';

      const result = await service.isPasswordCompromised(compromisedPassword);

      expect(result).toBe(true);
    });

    it('should return false for non-compromised password', async () => {
      const securePassword = 'MyVerySecureP@ssw0rd123';

      const result = await service.isPasswordCompromised(securePassword);

      expect(result).toBe(false);
    });

    it('should check against all common passwords in list', async () => {
      const commonPasswords = [
        '123456',
        'password123',
        'admin',
        'qwerty',
        'letmein',
      ];

      for (const password of commonPasswords) {
        const result = await service.isPasswordCompromised(password);
        expect(result).toBe(true);
      }
    });
  });

  describe('generatePasswordResetToken', () => {
    it('should generate password reset token', () => {
      const mockBuffer = Buffer.from('resetTokenBytes', 'utf8');
      const expectedHex = mockBuffer.toString('hex');

      (cryptoSpy.randomBytes as jest.Mock).mockReturnValue(mockBuffer);

      const result = service.generatePasswordResetToken();

      expect(cryptoSpy.randomBytes).toHaveBeenCalledWith(32);
      expect(result).toBe(expectedHex);
    });
  });

  describe('generateEmailVerificationToken', () => {
    it('should generate email verification token', () => {
      const mockBuffer = Buffer.from('verificationTokenBytes', 'utf8');
      const expectedHex = mockBuffer.toString('hex');

      (cryptoSpy.randomBytes as jest.Mock).mockReturnValue(mockBuffer);

      const result = service.generateEmailVerificationToken();

      expect(cryptoSpy.randomBytes).toHaveBeenCalledWith(32);
      expect(result).toBe(expectedHex);
    });
  });

  describe('hashPasswordWithCustomSalt', () => {
    it('should hash password with custom salt successfully', async () => {
      const password = 'testPassword123';
      const customSalt = 'customSalt';
      const hashedPassword = 'hashedWithCustomSalt';

      (bcryptSpy.hash as jest.Mock).mockResolvedValue(hashedPassword);

      const result = await service.hashPasswordWithCustomSalt(
        password,
        customSalt,
      );

      expect(bcryptSpy.hash).toHaveBeenCalledWith(password, customSalt);
      expect(result).toBe(hashedPassword);
    });

    it('should throw error when bcrypt.hash fails with custom salt', async () => {
      const password = 'testPassword123';
      const customSalt = 'customSalt';

      (bcryptSpy.hash as jest.Mock).mockRejectedValue(
        new Error('Hashing failed'),
      );

      await expect(
        service.hashPasswordWithCustomSalt(password, customSalt),
      ).rejects.toThrow('Password hashing failed');
      expect(bcryptSpy.hash).toHaveBeenCalledWith(password, customSalt);
    });
  });

  describe('generateSalt', () => {
    it('should generate salt with correct rounds', () => {
      const mockSalt = 'generatedSalt';
      (bcryptSpy.genSaltSync as jest.Mock).mockReturnValue(mockSalt);

      const result = service.generateSalt();

      expect(bcryptSpy.genSaltSync).toHaveBeenCalledWith(12);
      expect(result).toBe(mockSalt);
    });
  });

  describe('timingSafeCompare', () => {
    it('should return true for identical strings', async () => {
      const string1 = 'identicalString';
      const string2 = 'identicalString';

      const result = await service.timingSafeCompare(string1, string2);

      expect(result).toBe(true);
    });

    it('should return false for different strings of same length', async () => {
      const string1 = 'differentStr1';
      const string2 = 'differentStr2';

      const result = await service.timingSafeCompare(string1, string2);

      expect(result).toBe(false);
    });

    it('should return false for strings of different lengths', async () => {
      const string1 = 'short';
      const string2 = 'muchLongerString';

      const result = await service.timingSafeCompare(string1, string2);

      expect(result).toBe(false);
    });

    it('should return false for empty string vs non-empty string', async () => {
      const string1 = '';
      const string2 = 'nonEmpty';

      const result = await service.timingSafeCompare(string1, string2);

      expect(result).toBe(false);
    });

    it('should return true for two empty strings', async () => {
      const string1 = '';
      const string2 = '';

      const result = await service.timingSafeCompare(string1, string2);

      expect(result).toBe(true);
    });

    it('should be timing-safe for similar strings', async () => {
      const string1 = 'almostIdentical1';
      const string2 = 'almostIdentical2';

      const result = await service.timingSafeCompare(string1, string2);

      expect(result).toBe(false);
    });
  });
});
