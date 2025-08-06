// apps/notification-service/src/templates/services/template.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationTemplate } from '../entities/notification-template.entity';
import { TemplateService } from './template.service';
import { TemplateController } from './template.controler';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationTemplate])],
  controllers: [TemplateController],
  providers: [TemplateService],
  exports: [TemplateService],
})
export class TemplateModule {}
