import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import type { UpdateInfo } from '../../types';
import { UpdateBanner } from './UpdateBanner';

describe('UpdateBanner', () => {
  const defaultUpdateInfo: UpdateInfo = {
    currentVersion: '1.0.0',
    latestVersion: '2.0.0',
    installCommand: 'npm install -g @gitlab/duo-cli@latest',
  };

  describe('rendering', () => {
    it('displays the title', () => {
      const { lastFrame } = render(<UpdateBanner updateInfo={defaultUpdateInfo} columns={80} />);
      const output = lastFrame();

      expect(output).toContain('Update available');
    });

    it('displays the current and latest versions', () => {
      const { lastFrame } = render(<UpdateBanner updateInfo={defaultUpdateInfo} columns={80} />);
      const output = lastFrame();

      expect(output).toContain('1.0.0');
      expect(output).toContain('2.0.0');
    });

    it('displays the install command', () => {
      const { lastFrame } = render(<UpdateBanner updateInfo={defaultUpdateInfo} columns={80} />);
      const output = lastFrame();

      expect(output).toContain('npm install -g @gitlab/duo-cli@latest');
    });
  });

  it('never exceeds the terminal width', () => {
    for (const columns of [40, 80, 120]) {
      const output =
        render(<UpdateBanner updateInfo={defaultUpdateInfo} columns={columns} />).lastFrame() ?? '';
      const widest = Math.max(...output.split('\n').map((line) => line.length));
      expect(widest).toBeLessThanOrEqual(columns);
    }
  });
});
