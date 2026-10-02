import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return status ok with valid structure', () => {
    const response = controller.check();
    expect(response.status).toBe('ok');
    expect(response.version).toBe('0.1.0');
    expect(response.uptime).toBeGreaterThanOrEqual(0);
    expect(response.timestamp).toBeDefined();
  });
});
