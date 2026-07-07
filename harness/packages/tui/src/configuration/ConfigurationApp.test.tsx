import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ok, err, Result } from 'neverthrow';
import { createFakePartial } from '@gitlab-org/test-utils';
import { renderWithProviders } from '../test/render_helper';
import { ConfigurationModel, ConfigurationAppController } from './types';
import { ConfigurationApp } from './ConfigurationApp';

const waitForStateUpdate = async (ms = 50) =>
  new Promise((res) => {
    setTimeout(res, ms);
  });

const renderConfigurationApp = (
  initialState: ConfigurationModel,
  controller: ConfigurationAppController,
) => renderWithProviders(<ConfigurationApp initialState={initialState} controller={controller} />);

describe('ConfigurationApp', () => {
  let mockController: ConfigurationAppController;
  let baseState: ConfigurationModel;

  beforeEach(() => {
    mockController = createFakePartial<ConfigurationAppController>({
      exit: jest.fn(),
      saveConfig: jest.fn<ConfigurationAppController['saveConfig']>().mockResolvedValue(ok()),
      validateToken: jest.fn<ConfigurationAppController['validateToken']>().mockResolvedValue(ok()),
    });

    baseState = {
      configurationEntries: [
        {
          key: 'gitlabBaseUrl',
          value: '',
          displayName: '🔗 GitLab Instance URL',
          description: 'The URL of the GitLab instance to connect to.',
          defaultValue: 'https://gitlab.com',
          isSensitive: false,
        },
        {
          key: 'gitlabAuthToken',
          value: '',
          displayName: '🔖 GitLab Token',
          description: 'GitLab access token with API permissions.',
          defaultValue: '',
          isSensitive: true,
        },
      ],
    };
  });

  describe('when in url-input step', () => {
    it('shows Instance URL input with default placeholder', () => {
      const { lastFrame } = renderConfigurationApp(baseState, mockController);

      expect(lastFrame()).toContain('Instance URL');
      expect(lastFrame()).toContain('Press Enter to use https://gitlab.com');
    });

    it('shows existing URL value pre-filled when value is set', () => {
      baseState.configurationEntries[0].value = 'https://my-gitlab.example.com';
      const { lastFrame } = renderConfigurationApp(baseState, mockController);

      expect(lastFrame()).toContain('https://my-gitlab.example.com');
    });

    describe('when Enter is pressed', () => {
      it('advances to token-input step', async () => {
        const { sendInput, lastFrame } = renderConfigurationApp(baseState, mockController);

        sendInput('', { return: true });
        await waitForStateUpdate();

        expect(lastFrame()).toContain('Instance URL:');
        expect(lastFrame()).toContain('https://gitlab.com');
        expect(lastFrame()).toContain('Personal Access Token');
      });
    });
  });

  describe('when in token-input step', () => {
    let renderResult: ReturnType<typeof renderConfigurationApp>;

    beforeEach(async () => {
      renderResult = renderConfigurationApp(baseState, mockController);
      renderResult.sendInput('', { return: true });
      await waitForStateUpdate();
    });

    it('shows locked URL and token input', () => {
      expect(renderResult.lastFrame()).toContain('Instance URL:');
      expect(renderResult.lastFrame()).toContain('Personal Access Token');
    });

    it('shows masked token input', async () => {
      'my-secret-token'.split('').forEach((char) => {
        renderResult.sendInput(char);
      });
      await waitForStateUpdate();

      const frame = renderResult.lastFrame();
      expect(frame).not.toContain('my-secret-token');
      expect(frame).toContain('*');
    });

    describe('when token is submitted', () => {
      beforeEach(async () => {
        'glpat-test-token'.split('').forEach((char) => {
          renderResult.sendInput(char);
        });
        await waitForStateUpdate();
      });

      describe('when validation succeeds', () => {
        beforeEach(async () => {
          renderResult.sendInput('', { return: true });
          await waitForStateUpdate(100);
        });

        it('calls validateToken with URL and token', () => {
          expect(mockController.validateToken).toHaveBeenCalledWith(
            'https://gitlab.com',
            'glpat-test-token',
          );
        });

        it('saves config and exits', () => {
          expect(mockController.saveConfig).toHaveBeenCalled();
          expect(mockController.exit).toHaveBeenCalled();
        });
      });

      describe('when validation fails', () => {
        beforeEach(async () => {
          (
            mockController.validateToken as jest.Mock<() => Promise<Result<void, Error>>>
          ).mockResolvedValue(err(new Error('Token validation failed (HTTP 401)')));
          renderResult.sendInput('', { return: true });
          await waitForStateUpdate(100);
        });

        it('shows error message', () => {
          expect(renderResult.lastFrame()).toContain('Token validation failed (HTTP 401)');
        });

        it('shows retry hint', () => {
          expect(renderResult.lastFrame()).toContain('Press Enter to retry');
        });

        it('does not save config', () => {
          expect(mockController.saveConfig).not.toHaveBeenCalled();
        });

        describe('when Enter is pressed to retry', () => {
          beforeEach(async () => {
            (
              mockController.validateToken as jest.Mock<() => Promise<Result<void, Error>>>
            ).mockResolvedValue(ok());
            renderResult.sendInput('', { return: true });
            await waitForStateUpdate();
          });

          it('returns to token-input step', () => {
            expect(renderResult.lastFrame()).toContain('Personal Access Token');
          });
        });
      });
    });

    describe('when token is empty and Enter is pressed', () => {
      it('does not call validateToken', async () => {
        renderResult.sendInput('', { return: true });
        await waitForStateUpdate();

        expect(mockController.validateToken).not.toHaveBeenCalled();
      });
    });
  });

  describe('when Ctrl+C is pressed', () => {
    it('exits at url-input step', async () => {
      const { sendInput } = renderConfigurationApp(baseState, mockController);

      sendInput('c', { ctrl: true });
      await waitForStateUpdate();

      expect(mockController.exit).toHaveBeenCalled();
    });

    it('exits at token-input step', async () => {
      const { sendInput } = renderConfigurationApp(baseState, mockController);

      sendInput('', { return: true });
      await waitForStateUpdate();

      sendInput('c', { ctrl: true });
      await waitForStateUpdate();

      expect(mockController.exit).toHaveBeenCalled();
    });
  });

  describe('when custom URL is entered', () => {
    it('uses the custom URL for validation', async () => {
      const { sendInput } = renderConfigurationApp(baseState, mockController);

      'https://custom.gitlab.com'.split('').forEach((char) => {
        sendInput(char);
      });
      await waitForStateUpdate();

      sendInput('', { return: true });
      await waitForStateUpdate();

      expect(sendInput).toBeDefined();
      // Verify the URL is displayed locked
      // Now type a token and submit
      'my-token'.split('').forEach((char) => {
        sendInput(char);
      });
      await waitForStateUpdate();

      sendInput('', { return: true });
      await waitForStateUpdate(100);

      expect(mockController.validateToken).toHaveBeenCalledWith(
        'https://custom.gitlab.com',
        'my-token',
      );
    });
  });
});
