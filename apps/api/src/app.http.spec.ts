import { Test } from '@nestjs/testing';
import { AppHttpController } from './app.http';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppHttpController;

  beforeEach(async () => {
    const app = await Test.createTestingModule({
      controllers: [AppHttpController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppHttpController>(AppHttpController);
  });

  describe('getHello', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
