import { describe, it, expect, beforeEach } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { supportsToolCallApprovals, supportsPatternApprovals } from './capability_checker';

describe('supportsToolCallApprovals', () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
  });

  describe('when capabilities include tool_call_approval', () => {
    let capabilities: string[];

    beforeEach(() => {
      capabilities = ['shell_command', 'tool_call_approval'];
    });

    it('returns true', () => {
      const result = supportsToolCallApprovals({
        logger,
        capabilities,
      });

      expect(result).toBe(true);
    });

    it('logs debug message indicating capability check passed', () => {
      supportsToolCallApprovals({
        logger,
        capabilities,
      });

      expect(logger.debugLogs).toHaveLength(1);
      expect(logger.debugLogs[0]?.message).toContain('Tool approval persistence available');
    });
  });

  describe('when capabilities are null', () => {
    it('returns false', () => {
      const capabilities = null;

      const result = supportsToolCallApprovals({
        logger,
        capabilities,
      });

      expect(result).toBe(false);
    });

    it('logs warning about missing capabilities', () => {
      const capabilities = null;

      supportsToolCallApprovals({
        logger,
        capabilities,
      });

      expect(logger.warnLogs).toHaveLength(1);
      expect(logger.warnLogs[0]?.message).toContain('Server capabilities not available');
    });
  });

  describe('when capabilities do not include tool_call_approval', () => {
    it('returns false', () => {
      const capabilities = ['shell_command', 'read_file_chunked'];

      const result = supportsToolCallApprovals({
        logger,
        capabilities,
      });

      expect(result).toBe(false);
    });

    it('logs warning about Gateway not supporting feature', () => {
      const capabilities = ['shell_command', 'read_file_chunked'];

      supportsToolCallApprovals({
        logger,
        capabilities,
      });

      expect(logger.warnLogs).toHaveLength(1);
      expect(logger.warnLogs[0]?.message).toContain('Tool approval persistence unavailable');
      expect(logger.warnLogs[0]?.message).toContain(
        "Gateway doesn't have 'tool_call_approval' capability",
      );
    });
  });
});

describe('supportsPatternApprovals', () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
  });

  describe('when capabilities include tool_call_pattern_approval', () => {
    it('returns true', () => {
      const capabilities = ['tool_call_approval', 'tool_call_pattern_approval'];

      const result = supportsPatternApprovals({ logger, capabilities });

      expect(result).toBe(true);
    });

    it('logs debug message', () => {
      const capabilities = ['tool_call_approval', 'tool_call_pattern_approval'];

      supportsPatternApprovals({ logger, capabilities });

      expect(logger.debugLogs).toHaveLength(1);
      expect(logger.debugLogs[0]?.message).toContain('Pattern approval available');
    });
  });

  describe('when capabilities are null', () => {
    it('returns false', () => {
      const result = supportsPatternApprovals({ logger, capabilities: null });

      expect(result).toBe(false);
    });
  });

  describe('when capabilities do not include tool_call_pattern_approval', () => {
    it('returns false', () => {
      const capabilities = ['tool_call_approval'];

      const result = supportsPatternApprovals({ logger, capabilities });

      expect(result).toBe(false);
    });

    it('logs debug message about missing capability', () => {
      const capabilities = ['tool_call_approval'];

      supportsPatternApprovals({ logger, capabilities });

      expect(logger.debugLogs).toHaveLength(1);
      expect(logger.debugLogs[0]?.message).toContain(
        "Gateway doesn't have 'tool_call_pattern_approval' capability",
      );
    });
  });
});
