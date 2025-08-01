import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerServiceController } from './scheduler-service.controller';
import { SchedulerServiceService } from './scheduler-service.service';

describe('SchedulerServiceController', () => {
  let schedulerServiceController: SchedulerServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [SchedulerServiceController],
      providers: [SchedulerServiceService],
    }).compile();

    schedulerServiceController = app.get<SchedulerServiceController>(SchedulerServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(schedulerServiceController.getHello()).toBe('Hello World!');
    });
  });
});
