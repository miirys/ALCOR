import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { Diff } from './Diff';

describe('Diff', () => {
  const samplePatch = `@@ -1,3 +1,4 @@
 context line
-removed line
+added line
+another added line`;

  describe('when patch has content', () => {
    it('should display the diff lines', () => {
      const { lastFrame } = render(
        <Diff patch={samplePatch} oldFilepath="file.ts" newFilepath="file.ts" />,
      );

      expect(lastFrame()).toContain('context line');
      expect(lastFrame()).toContain('removed line');
      expect(lastFrame()).toContain('added line');
    });
  });

  describe('when file is renamed', () => {
    it('should display rename information', () => {
      const { lastFrame } = render(
        <Diff patch={samplePatch} oldFilepath="old.ts" newFilepath="new.ts" />,
      );

      expect(lastFrame()).toContain('Renamed: old.ts → new.ts');
    });
  });

  describe('when patch is empty', () => {
    it('should display identical files message', () => {
      const { lastFrame } = render(<Diff patch="" oldFilepath="file.ts" newFilepath="file.ts" />);

      expect(lastFrame()).toContain('Files content is identical');
    });

    describe('when file is renamed', () => {
      it('should display rename information without diff', () => {
        const { lastFrame } = render(<Diff patch="" oldFilepath="old.ts" newFilepath="new.ts" />);

        expect(lastFrame()).toContain('Renamed: old.ts → new.ts');
        expect(lastFrame()).not.toContain('Files content is identical');
      });
    });
  });
});
