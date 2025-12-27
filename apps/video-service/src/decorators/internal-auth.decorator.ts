// apps/video-service/src/decorators/internal-auth.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_INTERNAL_KEY = 'isInternal';
export const InternalAuth = () => SetMetadata(IS_INTERNAL_KEY, true);
