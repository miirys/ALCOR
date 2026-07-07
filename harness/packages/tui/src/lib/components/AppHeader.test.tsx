import { describe, it, expect } from '@jest/globals';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { EnvironmentContext, EnvInfo } from '../environment_context';
import { AppHeader } from './AppHeader';

const envInfo: EnvInfo = {
  terminalName: 'test',
  isKittyProtocolSupported: false,
  duoCliVersion: '1.0.0',
  environment: 'development',
  distribution: 'npm',
  osPlatform: 'linux',
  osVersion: '5',
  theme: 'dark',
};

const renderHeader = (columns: number) =>
  render(
    <EnvironmentContext.Provider value={envInfo}>
      <AppHeader columns={columns}>
        <Text>info content</Text>
      </AppHeader>
    </EnvironmentContext.Provider>,
  );

describe('AppHeader', () => {
  it('renders the logo and version on wide terminals', () => {
    const output = renderHeader(80).lastFrame() ?? '';

    expect(output).toContain('ALCOR');
    expect(output).toContain('80 UMa');
    expect(output).toContain('info content');
  });

  it('hides the logo and version on narrow terminals so content has room to wrap', () => {
    const output = renderHeader(40).lastFrame() ?? '';

    expect(output).not.toContain('ALCOR');
    expect(output).not.toContain('80 UMa');
    expect(output).toContain('info content');
  });

  it('never exceeds the terminal width', () => {
    for (const columns of [30, 40, 59, 60, 80, 120]) {
      const output = renderHeader(columns).lastFrame() ?? '';
      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(columns);
    }
  });
});
