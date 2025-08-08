// apps/notification-service/src/clients/client.module.ts
import { Module } from '@nestjs/common';
import { NotificationServiceClient } from './notification-service.client';
import { MailerModule } from '../notifications/services/mailer.module';
import { NotificationModule } from '../notifications/services/notification.module';

@Module({
  imports: [MailerModule, NotificationModule],
  providers: [NotificationServiceClient],
  exports: [NotificationServiceClient],
})
export class NotificationClientModule {}
