import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import { DiffLinePrefix } from './DiffLinePrefix';

describe('DiffLinePrefix', () => {
  describe('when both line numbers are provided', () => {
    it('should display both old and new line numbers', () => {
      const { lastFrame } = render(
        <DiffLinePrefix oldLineNum={10} newLineNum={12} backgroundColor="#000" />,
      );

      expect(lastFrame()).toContain(' 10');
      expect(lastFrame()).toContain(' 12');
    });
  });

  describe('when only old line number is provided', () => {
    it('should display old line number and blank for new', () => {
      const { lastFrame } = render(<DiffLinePrefix oldLineNum={5} backgroundColor="#000" />);

      expect(lastFrame()).toContain('  5');
    });
  });

  describe('when only new line number is provided', () => {
    it('should display new line number and blank for old', () => {
      const { lastFrame } = render(<DiffLinePrefix newLineNum={7} backgroundColor="#000" />);

      expect(lastFrame()).toContain('  7');
    });
  });

  describe('when no line numbers are provided', () => {
    it('should render spacer', () => {
      const { lastFrame } = render(<DiffLinePrefix backgroundColor="#000" />);

      expect(lastFrame()).toBeDefined();
    });
  });

  describe('when diffPrefix is provided', () => {
    it('should display the + prefix for addition lines', () => {
      const { lastFrame } = render(
        <DiffLinePrefix oldLineNum={1} newLineNum={2} backgroundColor="#000" diffPrefix="+" />,
      );

      expect(lastFrame()).toContain('+');
    });

    it('should display the - prefix for deletion lines', () => {
      const { lastFrame } = render(
        <DiffLinePrefix oldLineNum={1} newLineNum={2} backgroundColor="#000" diffPrefix="-" />,
      );

      expect(lastFrame()).toContain('-');
    });
  });

  describe('when diffPrefix is omitted', () => {
    it('should default to a space character', () => {
      const { lastFrame: withDefault } = render(
        <DiffLinePrefix oldLineNum={1} newLineNum={2} backgroundColor="#000" />,
      );
      const { lastFrame: withSpace } = render(
        <DiffLinePrefix oldLineNum={1} newLineNum={2} backgroundColor="#000" diffPrefix=" " />,
      );

      expect(withDefault()).toEqual(withSpace());
    });
  });
});
