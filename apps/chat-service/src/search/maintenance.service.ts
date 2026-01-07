// apps/chat-service/src/search/maintenance.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    @InjectQueue('search-indexing')
    private readonly searchIndexingQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCleanup() {
    try {
      this.logger.log('Starting daily index cleanup');
      await this.searchIndexingQueue.add(
        'cleanup-index',
        { olderThanDays: 90 },
        { priority: 5 },
      );
    } catch (error) {
      this.logger.error(`Failed to schedule cleanup job: ${error.message}`);
    }
  }

  @Cron(CronExpression.EVERY_WEEKEND)
  async handleOptimization() {
    try {
      this.logger.log('Starting weekly index optimization');
      await this.searchIndexingQueue.add(
        'optimize-index',
        { forceMerge: true },
        { priority: 10 },
      );
    } catch (error) {
      this.logger.error(`Failed to schedule optimization job: ${error.message}`);
    }
  }

  /**
   * Manual trigger for testing or urgent maintenance
   */
  async triggerMaintenance() {
    this.logger.log('Manual maintenance trigger received');
    await this.handleCleanup();
    await this.handleOptimization();
  }
}
