import { LOG_LEVEL, Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultConfigService } from '@gitlab-org/config';
import { DefaultSleepDetectionService } from './sleep_detection_service';

describe('SleepDetectionService', () => {
  let sleepDetectionService: DefaultSleepDetectionService;
  let configService: DefaultConfigService;
  let logger: Logger;
  let start: number;

  const pretendSleep = () => {
    jest.advanceTimersByTime(1000); // trigger the interval callback

    jest.setSystemTime(start + 5000); // shift clock by 5s

    jest.advanceTimersByTime(1000); // trigger the callback again
  };

  beforeEach(() => {
    jest.useFakeTimers();
    start = Date.now();
    jest.setSystemTime(start);

    logger = createFakePartial<Logger>({
      debug: jest.fn(),
    });

    configService = new DefaultConfigService();

    configService.set('logLevel', LOG_LEVEL.INFO);

    sleepDetectionService = new DefaultSleepDetectionService(configService, logger);
  });

  afterEach(() => {
    jest.useRealTimers();
    sleepDetectionService.dispose();
  });

  it('should not start sleep detection when log level is not DEBUG', () => {
    configService.set('logLevel', LOG_LEVEL.INFO);

    pretendSleep();

    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('should detect sleep when time difference is greater than threshold', () => {
    configService.set('logLevel', LOG_LEVEL.DEBUG);

    pretendSleep();

    expect(logger.debug).toHaveBeenCalled();
    expect(jest.mocked(logger.debug).mock.calls[0][0]).toBe(
      '[SleepDetectionService] System woke up from sleep after 5s.',
    );
  });

  it('should stop sleep detection when log level changes from DEBUG to another level', () => {
    configService.set('logLevel', LOG_LEVEL.DEBUG);
    configService.set('logLevel', LOG_LEVEL.INFO);

    pretendSleep();

    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('should dispose subscription when service is disposed', () => {
    configService.set('logLevel', LOG_LEVEL.DEBUG);
    sleepDetectionService.dispose();

    pretendSleep();

    expect(logger.debug).not.toHaveBeenCalled();
  });
});
