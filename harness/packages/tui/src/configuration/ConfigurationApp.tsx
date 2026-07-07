import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useUnifiedInput, KeyChecks } from '../lib/input/unified';
import { MultilineTextInput } from '../lib/components/MultilineTextInput';
import { ConfigurationAppController, ConfigurationModel } from './types';

export interface AuthenticationProps {
  initialState: ConfigurationModel;
  controller: ConfigurationAppController;
}

type Step = 'url-input' | 'token-input' | 'validating' | 'success' | 'error';

export const ConfigurationApp: React.FC<AuthenticationProps> = ({ initialState, controller }) => {
  const urlEntry = initialState.configurationEntries.find((e) => e.key === 'gitlabBaseUrl');
  const tokenEntry = initialState.configurationEntries.find((e) => e.key === 'gitlabAuthToken');

  const defaultUrl = urlEntry?.defaultValue || 'https://gitlab.com';
  const existingUrl = urlEntry?.value || '';

  const [step, setStep] = useState<Step>('url-input');
  const [url, setUrl] = useState(existingUrl);
  const [token, setToken] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const resolvedUrl = url || defaultUrl;

  const submitUrl = useCallback(() => {
    setStep('token-input');
  }, []);

  const submitToken = useCallback(async () => {
    const currentToken = token;
    if (!currentToken) return;

    setStep('validating');
    const result = await controller.validateToken(resolvedUrl, currentToken);

    if (result.isOk()) {
      setStep('success');
      const saveResult = await controller.saveConfig({
        configurationEntries: [
          {
            key: 'gitlabBaseUrl',
            value: resolvedUrl,
            displayName: urlEntry?.displayName ?? '',
            description: urlEntry?.description ?? '',
            defaultValue: defaultUrl,
            isSensitive: false,
          },
          {
            key: 'gitlabAuthToken',
            value: currentToken,
            displayName: tokenEntry?.displayName ?? '',
            description: tokenEntry?.description ?? '',
            defaultValue: '',
            isSensitive: true,
          },
        ],
      });
      saveResult.match(
        () => controller.exit(),
        () => controller.exit(),
      );
    } else {
      setErrorMessage(result.error.message);
      setStep('error');
    }
  }, [token, resolvedUrl, controller, urlEntry, tokenEntry, defaultUrl]);

  useUnifiedInput(async (key) => {
    if (KeyChecks.isCtrl('c', key)) {
      controller.exit();
      return;
    }

    if (KeyChecks.isEnter(key)) {
      if (step === 'url-input') {
        submitUrl();
      } else if (step === 'token-input') {
        await submitToken();
      } else if (step === 'error') {
        setStep('token-input');
        setToken('');
        setErrorMessage('');
      }
    }
  });

  const urlPlaceholder = existingUrl
    ? `Press Enter to use ${existingUrl}`
    : `Press Enter to use ${defaultUrl}`;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" paddingX={2} paddingTop={1}>
        <Text bold>ALCOR Configuration</Text>
        <Text dimColor>
          Connect to your GitLab instance by providing a URL and personal access token.
        </Text>
        {initialState.configFilePath && (
          <Text dimColor>Configuration file: {initialState.configFilePath}</Text>
        )}
      </Box>

      <Box flexDirection="column" paddingX={2} paddingTop={1}>
        {/* URL step */}
        {step === 'url-input' && (
          <Box flexDirection="column">
            <Text bold>Instance URL</Text>
            <MultilineTextInput value={url} onChange={setUrl} placeholder={urlPlaceholder} />
          </Box>
        )}

        {/* Token step — show locked URL + token input */}
        {(step === 'token-input' ||
          step === 'validating' ||
          step === 'success' ||
          step === 'error') && (
          <Box flexDirection="column">
            <Text>
              <Text bold>Instance URL: </Text>
              <Text>{resolvedUrl}</Text>
              <Text color="green"> ✓</Text>
            </Text>
          </Box>
        )}

        {step === 'token-input' && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Personal Access Token</Text>
            <MultilineTextInput
              value={token}
              onChange={setToken}
              placeholder="Enter your GitLab personal access token"
              masked
            />
            <Text dimColor>
              Create a token at {resolvedUrl}
              /-/user_settings/personal_access_tokens/legacy/new?name=Duo+CLI&scopes=api
            </Text>
          </Box>
        )}

        {step === 'validating' && (
          <Box marginTop={1}>
            <Text>Validating token…</Text>
          </Box>
        )}

        {step === 'success' && (
          <Box marginTop={1}>
            <Text color="green">✓ Token verified</Text>
          </Box>
        )}

        {step === 'error' && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="red">✗ {errorMessage}</Text>
            <Text dimColor>Press Enter to retry</Text>
          </Box>
        )}
      </Box>

      <Box paddingX={2} paddingTop={1}>
        <Text dimColor>Press Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
};
