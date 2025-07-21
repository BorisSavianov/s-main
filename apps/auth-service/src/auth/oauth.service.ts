// src/auth/oauth.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthProvider } from '../database/entities/oauth-provider.entity';
import { User } from '../database/entities/user.entity';

export interface CreateOAuthProviderDto {
  userId: string;
  provider: string;
  providerId: string;
  providerEmail?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface UpdateOAuthTokensDto {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface OAuthProviderInfo {
  id: string;
  provider: string;
  providerId: string;
  providerEmail?: string;
  isTokenExpired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OAuthService {
  constructor(
    @InjectRepository(OAuthProvider)
    private readonly oauthProviderRepository: Repository<OAuthProvider>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createOAuthProvider(
    createDto: CreateOAuthProviderDto,
  ): Promise<OAuthProvider> {
    const {
      userId,
      provider,
      providerId,
      providerEmail,
      accessToken,
      refreshToken,
      expiresAt,
    } = createDto;

    // Check if OAuth provider already exists
    const existingProvider = await this.oauthProviderRepository.findOne({
      where: { providerId, provider },
    });

    if (existingProvider) {
      throw new BadRequestException('OAuth provider already exists');
    }

    // Verify user exists
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create new OAuth provider
    const oauthProvider = this.oauthProviderRepository.create({
      userId,
      provider,
      providerId,
      providerEmail,
      accessToken,
      refreshToken,
      expiresAt,
    });

    return await this.oauthProviderRepository.save(oauthProvider);
  }

  async findOAuthProvider(
    providerId: string,
    provider: string,
  ): Promise<OAuthProvider | null> {
    return await this.oauthProviderRepository.findOne({
      where: { providerId, provider },
      relations: ['user'],
    });
  }

  async findOAuthProviderById(id: string): Promise<OAuthProvider | null> {
    return await this.oauthProviderRepository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async getUserOAuthProviders(userId: string): Promise<OAuthProviderInfo[]> {
    const providers = await this.oauthProviderRepository.find({
      where: { userId },
      select: [
        'id',
        'provider',
        'providerId',
        'providerEmail',
        'expiresAt',
        'createdAt',
        'updatedAt',
      ],
    });

    return providers.map((provider) => ({
      id: provider.id,
      provider: provider.provider,
      providerId: provider.providerId,
      providerEmail: provider.providerEmail,
      isTokenExpired: this.isTokenExpired(provider.expiresAt),
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    }));
  }

  async updateOAuthTokens(
    providerId: string,
    updateDto: UpdateOAuthTokensDto,
  ): Promise<OAuthProvider> {
    const oauthProvider = await this.oauthProviderRepository.findOne({
      where: { id: providerId },
    });

    if (!oauthProvider) {
      throw new NotFoundException('OAuth provider not found');
    }

    // Update tokens
    if (updateDto.accessToken !== undefined) {
      oauthProvider.accessToken = updateDto.accessToken;
    }

    if (updateDto.refreshToken !== undefined) {
      oauthProvider.refreshToken = updateDto.refreshToken;
    }

    if (updateDto.expiresAt !== undefined) {
      oauthProvider.expiresAt = updateDto.expiresAt;
    }

    oauthProvider.updatedAt = new Date();

    return await this.oauthProviderRepository.save(oauthProvider);
  }

  async unlinkOAuthProvider(userId: string, providerId: string): Promise<void> {
    // Verify the provider belongs to the user
    const oauthProvider = await this.oauthProviderRepository.findOne({
      where: { id: providerId, userId },
    });

    if (!oauthProvider) {
      throw new NotFoundException('OAuth provider not found');
    }

    // Check if user has a password or other OAuth providers
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['oauthProviders'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Ensure user has either a password or other OAuth providers
    const hasPassword = !!user.passwordHash;
    const hasOtherProviders = user.oauthProviders.length > 1;

    if (!hasPassword && !hasOtherProviders) {
      throw new BadRequestException(
        'Cannot unlink the only authentication method. Please set a password first.',
      );
    }

    // Remove the OAuth provider
    await this.oauthProviderRepository.remove(oauthProvider);
  }

  async linkOAuthProvider(
    userId: string,
    providerId: string,
    provider: string,
    providerEmail?: string,
    accessToken?: string,
    refreshToken?: string,
    expiresAt?: Date,
  ): Promise<OAuthProvider> {
    // Check if this OAuth provider is already linked to another user
    const existingProvider = await this.oauthProviderRepository.findOne({
      where: { providerId, provider },
    });

    if (existingProvider) {
      if (existingProvider.userId !== userId) {
        throw new BadRequestException(
          'This OAuth account is already linked to another user',
        );
      }
      // If it's the same user, just update the tokens
      return await this.updateOAuthTokens(existingProvider.id, {
        accessToken,
        refreshToken,
        expiresAt,
      });
    }

    // Create new OAuth provider link
    return await this.createOAuthProvider({
      userId,
      provider,
      providerId,
      providerEmail,
      accessToken,
      refreshToken,
      expiresAt,
    });
  }

  async refreshOAuthToken(
    providerId: string,
    newAccessToken: string,
    newRefreshToken?: string,
    expiresAt?: Date,
  ): Promise<OAuthProvider> {
    const oauthProvider = await this.oauthProviderRepository.findOne({
      where: { id: providerId },
    });

    if (!oauthProvider) {
      throw new NotFoundException('OAuth provider not found');
    }

    oauthProvider.accessToken = newAccessToken;

    if (newRefreshToken) {
      oauthProvider.refreshToken = newRefreshToken;
    }

    if (expiresAt) {
      oauthProvider.expiresAt = expiresAt;
    }

    oauthProvider.updatedAt = new Date();

    return await this.oauthProviderRepository.save(oauthProvider);
  }

  async getOAuthProvidersByProvider(
    provider: string,
  ): Promise<OAuthProvider[]> {
    return await this.oauthProviderRepository.find({
      where: { provider },
      relations: ['user'],
    });
  }

  async deleteUserOAuthProviders(userId: string): Promise<void> {
    await this.oauthProviderRepository.delete({ userId });
  }

  async isProviderLinked(userId: string, provider: string): Promise<boolean> {
    const count = await this.oauthProviderRepository.count({
      where: { userId, provider },
    });
    return count > 0;
  }

  async getUserProviderByType(
    userId: string,
    provider: string,
  ): Promise<OAuthProvider | null> {
    return await this.oauthProviderRepository.findOne({
      where: { userId, provider },
    });
  }

  private isTokenExpired(expiresAt?: Date): boolean {
    if (!expiresAt) return false;
    return new Date() > expiresAt;
  }

  // Helper method to validate OAuth provider type
  isValidProvider(provider: string): boolean {
    const validProviders = ['google', 'facebook'];
    return validProviders.includes(provider.toLowerCase());
  }

  // Helper method to get provider display name
  getProviderDisplayName(provider: string): string {
    const displayNames: Record<string, string> = {
      google: 'Google',
      facebook: 'Facebook',
    };
    return displayNames[provider.toLowerCase()] || provider;
  }

  // Method to handle OAuth provider errors
  async handleOAuthError(
    providerId: string,
    provider: string,
    error: any,
  ): Promise<void> {
    console.error(
      `OAuth error for provider ${provider} (${providerId}):`,
      error,
    );

    // You might want to implement specific error handling logic here
    // such as marking tokens as expired, sending notifications, etc.
  }

  // Method to get statistics about OAuth usage
  async getOAuthStats(): Promise<{
    totalProviders: number;
    providerBreakdown: Record<string, number>;
    activeProviders: number;
    expiredTokens: number;
  }> {
    const providers = await this.oauthProviderRepository.find({
      select: ['provider', 'expiresAt'],
    });

    const providerBreakdown: Record<string, number> = {};
    let expiredTokens = 0;

    providers.forEach((provider) => {
      // Count by provider type
      providerBreakdown[provider.provider] =
        (providerBreakdown[provider.provider] || 0) + 1;

      // Count expired tokens
      if (this.isTokenExpired(provider.expiresAt)) {
        expiredTokens++;
      }
    });

    return {
      totalProviders: providers.length,
      providerBreakdown,
      activeProviders: providers.length - expiredTokens,
      expiredTokens,
    };
  }
}
