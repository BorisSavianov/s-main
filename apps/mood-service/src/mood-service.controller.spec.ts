import { Test, TestingModule } from '@nestjs/testing';
import { MoodServiceController } from './mood-service.controller';
import { MoodServiceService } from './mood-service.service';

describe('MoodServiceController', () => {
  let moodServiceController: MoodServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [MoodServiceController],
      providers: [MoodServiceService],
    }).compile();

    moodServiceController = app.get<MoodServiceController>(MoodServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(moodServiceController.getHello()).toBe('Hello World!');
    });
  });
});
