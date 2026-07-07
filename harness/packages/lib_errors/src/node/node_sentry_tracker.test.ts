import * as Sentry from '@sentry/node';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultConfigService } from '@gitlab-org/config';
import { SystemContext } from '@gitlab-org/request-context';
import { SanitizedError } from '../sanitized_error';
import { NodeSentryTracker } from './node_sentry_tracker';

jest.mock('@sentry/node');

describe('Sentry Tracker', () => {
  let sentryTracker: NodeSentryTracker;
  let configService: DefaultConfigService;

  beforeEach(() => {
    configService = new DefaultConfigService();
    sentryTracker = new NodeSentryTracker(configService, createFakePartial<SystemContext>({}));
  });

  describe('isEnabled', () => {
    it('should be enabled by default', () => {
      expect(sentryTracker.isEnabled()).toBe(true);
      const error = new SanitizedError('test error', new Error());
      sentryTracker.trackError(error);
      expect(Sentry.captureException).toHaveBeenCalledWith({ message: 'test error' });
    });

    it('should be toggled by telemetry config', () => {
      configService.set('telemetry.enabled', false);
      expect(sentryTracker.isEnabled()).toBe(false);
      const error = new SanitizedError('test error', new Error());
      sentryTracker.trackError(error);
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('handles additional data', () => {
      const additionalData = { correlationId: 'test' };
      expect(sentryTracker.isEnabled()).toBe(true);
      const error = new SanitizedError('test error', new Error());
      sentryTracker.trackError(error, additionalData);
      expect(Sentry.setExtras).toHaveBeenCalledWith(additionalData);
      expect(Sentry.captureException).toHaveBeenCalledWith({ message: 'test error' });
    });

    it('sets ide.name tag', () => {
      const error = new SanitizedError('test', new Error());
      sentryTracker.trackError(error);
      expect(Sentry.setTag).toHaveBeenCalledWith('ide.name', expect.any(String));
    });
  });

  describe('when disposed', () => {
    beforeEach(() => sentryTracker.dispose());

    it('flushes Sentry on dispose', () => {
      expect(Sentry.flush).toHaveBeenCalledWith(2000);
    });
  });
});
