import {
  FeatureFlagService,
  InstanceFeatureFlags,
  GitLabApiService,
  DefaultInstanceFeatureFlagsService,
  versionRequest,
} from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import type { Logger } from '@gitlab-org/logging';
import { DuoExclusionChecker, DefaultDuoExclusionChecker } from './exclusion_checker';
import { DuoProject } from './workspace_project_access_cache';

jest.useFakeTimers();

describe('DuoExclusionChecker', () => {
  let exclusionChecker: DuoExclusionChecker;
  let mockProject: DuoProject;
  let mockFeatureFlagService: FeatureFlagService;

  beforeEach(() => {
    mockFeatureFlagService = createFakePartial<FeatureFlagService>({
      isInstanceFlagEnabled: jest.fn().mockReturnValue(true), // Default to enabled
    });
    exclusionChecker = new DefaultDuoExclusionChecker(mockFeatureFlagService);
    mockProject = {
      projectPath: 'test-project',
      uri: 'file:///test/project/.git/config',
      enabled: true,
      exclusionRules: [],
      host: 'gitlab.com',
      namespace: 'test-namespace',
      namespaceWithPath: 'test-namespace/test-project',
      remoteName: 'origin',
    };
  });

  describe('version support', () => {
    beforeEach(() => {
      mockProject.exclusionRules = ['*.log', 'node_modules/', '**/*.test.ts'];
    });

    describe('when use_duo_context_exclusion is enabled (18.5+)', () => {
      beforeEach(() => {
        jest.mocked(mockFeatureFlagService.isInstanceFlagEnabled).mockReturnValue(true);
      });

      it('should apply exclusion rules for single file check', () => {
        const result = exclusionChecker.checkFileExclusion('debug.log', mockProject);

        expect(mockFeatureFlagService.isInstanceFlagEnabled).toHaveBeenCalledWith(
          InstanceFeatureFlags.UseDuoContextExclusion,
        );
        expect(result.isExcluded).toBe(true);
        expect(result.project).toBe(mockProject);
      });

      it('should apply exclusion rules for multiple file check', () => {
        const filenames = ['debug.log', 'src/main.ts', 'node_modules/package.json'];
        const result = exclusionChecker.checkMultipleFileExclusions(filenames, mockProject);

        expect(mockFeatureFlagService.isInstanceFlagEnabled).toHaveBeenCalledWith(
          InstanceFeatureFlags.UseDuoContextExclusion,
        );
        expect(result.results.get('debug.log')).toBe(true);
        expect(result.results.get('src/main.ts')).toBe(false);
        expect(result.results.get('node_modules/package.json')).toBe(true);
      });
    });

    describe('when use_duo_context_exclusion is disabled (pre-18.5)', () => {
      beforeEach(() => {
        jest.mocked(mockFeatureFlagService.isInstanceFlagEnabled).mockReturnValue(false);
      });

      it('should never exclude any files for single file check', () => {
        const result = exclusionChecker.checkFileExclusion('debug.log', mockProject);

        expect(mockFeatureFlagService.isInstanceFlagEnabled).toHaveBeenCalledWith(
          InstanceFeatureFlags.UseDuoContextExclusion,
        );
        expect(result.isExcluded).toBe(false);
        expect(result.project).toBe(mockProject);
      });

      it('should never exclude any files for multiple file check', () => {
        const filenames = ['debug.log', 'src/main.ts', 'node_modules/package.json'];
        const result = exclusionChecker.checkMultipleFileExclusions(filenames, mockProject);

        expect(mockFeatureFlagService.isInstanceFlagEnabled).toHaveBeenCalledWith(
          InstanceFeatureFlags.UseDuoContextExclusion,
        );
        expect(result.results.get('debug.log')).toBe(false);
        expect(result.results.get('src/main.ts')).toBe(false);
        expect(result.results.get('node_modules/package.json')).toBe(false);
      });

      it('should return all files as not excluded even with complex exclusion rules', () => {
        mockProject.exclusionRules = [
          'node_modules/',
          'dist/',
          '*.log',
          '!important.log',
          'test/**/*.tmp',
          '**/*.backup',
        ];

        const filenames = [
          'node_modules/package/index.js',
          'dist/bundle.js',
          'debug.log',
          'important.log',
          'test/unit/cache.tmp',
          'src/main.ts.backup',
          'src/main.ts',
        ];

        const result = exclusionChecker.checkMultipleFileExclusions(filenames, mockProject);

        filenames.forEach((filename) => {
          expect(result.results.get(filename)).toBe(false);
        });
      });
    });

    describe('when flag is missing (defaults to true for 18.5+)', () => {
      let api: GitLabApiService;
      let realInstanceFeatureFlagService: DefaultInstanceFeatureFlagsService;
      let featureFlagService: FeatureFlagService;
      let mockLogger: Logger;

      beforeEach(async () => {
        mockLogger = createMockLogger();
        api = createFakePartial<GitLabApiService>({
          fetchFromApi: jest.fn(),
          onApiReconfigured: jest.fn(),
        });

        // Setup API to return version 18.5.0 but no feature flag in response
        jest.mocked(api.fetchFromApi).mockImplementation((request) => {
          if (request === versionRequest) {
            return Promise.resolve({ version: '18.5.0' });
          }
          if (request.type === 'graphql' && request.variables?.names) {
            // Return empty feature flags array to simulate flag not existing
            return Promise.resolve({
              metadata: {
                featureFlags: [],
              },
            });
          }
          return Promise.reject(new Error('Unexpected request'));
        });

        realInstanceFeatureFlagService = new DefaultInstanceFeatureFlagsService(mockLogger, api);
        await realInstanceFeatureFlagService.updateInstanceFeatureFlags();

        // Create a FeatureFlagService that wraps the instance service
        featureFlagService = createFakePartial<FeatureFlagService>({
          isInstanceFlagEnabled: (flag: InstanceFeatureFlags) =>
            realInstanceFeatureFlagService.isInstanceFlagEnabled(flag),
          isClientFlagEnabled: () => false,
          updateInstanceFeatureFlags: () =>
            realInstanceFeatureFlagService.updateInstanceFeatureFlags(),
          onChanged: (listener) => realInstanceFeatureFlagService.onChanged?.(listener),
        });

        // Create exclusion checker with the feature flag service
        exclusionChecker = new DefaultDuoExclusionChecker(featureFlagService);
      });

      afterEach(() => {
        // Cancel any pending throttled calls to prevent open handles
        jest.clearAllTimers();
      });

      it('should apply exclusion rules when flag defaults to enabled', () => {
        const result = exclusionChecker.checkFileExclusion('debug.log', mockProject);

        expect(result.isExcluded).toBe(true);
        expect(result.project).toBe(mockProject);
      });

      it('should apply exclusion rules for multiple files when flag defaults to enabled', () => {
        const filenames = ['debug.log', 'src/main.ts', 'node_modules/package.json'];
        const result = exclusionChecker.checkMultipleFileExclusions(filenames, mockProject);

        expect(result.results.get('debug.log')).toBe(true);
        expect(result.results.get('src/main.ts')).toBe(false);
        expect(result.results.get('node_modules/package.json')).toBe(true);
      });

      it('should verify the flag is enabled by default in the feature flag service', () => {
        expect(
          realInstanceFeatureFlagService.isInstanceFlagEnabled(
            InstanceFeatureFlags.UseDuoContextExclusion,
          ),
        ).toBe(true);
      });
    });
  });

  describe('checkFileExclusion', () => {
    it('should return not excluded when no exclusion rules are defined', () => {
      mockProject.exclusionRules = [];
      const result = exclusionChecker.checkFileExclusion('src/main.ts', mockProject);

      expect(result.isExcluded).toBe(false);
      expect(result.project).toBe(mockProject);
    });

    it('should return not excluded when exclusion rules are empty', () => {
      mockProject.exclusionRules = [''];
      const result = exclusionChecker.checkFileExclusion('src/main.ts', mockProject);

      expect(result.isExcluded).toBe(false);
      expect(result.project).toBe(mockProject);
    });

    it('should exclude files matching simple patterns', () => {
      mockProject.exclusionRules = ['*.log', '*.tmp'];

      expect(exclusionChecker.checkFileExclusion('debug.log', mockProject).isExcluded).toBe(true);
      expect(exclusionChecker.checkFileExclusion('cache.tmp', mockProject).isExcluded).toBe(true);
      expect(exclusionChecker.checkFileExclusion('main.ts', mockProject).isExcluded).toBe(false);
    });

    it('should exclude files matching directory patterns', () => {
      mockProject.exclusionRules = ['node_modules/', 'dist/'];

      expect(
        exclusionChecker.checkFileExclusion('node_modules/package/index.js', mockProject)
          .isExcluded,
      ).toBe(true);
      expect(exclusionChecker.checkFileExclusion('dist/bundle.js', mockProject).isExcluded).toBe(
        true,
      );
      expect(exclusionChecker.checkFileExclusion('src/main.ts', mockProject).isExcluded).toBe(
        false,
      );
    });

    it('should handle wildcard patterns', () => {
      mockProject.exclusionRules = ['**/*.test.ts', 'src/**/*.spec.js'];

      expect(
        exclusionChecker.checkFileExclusion('src/components/button.test.ts', mockProject)
          .isExcluded,
      ).toBe(true);
      expect(
        exclusionChecker.checkFileExclusion('tests/unit/helper.test.ts', mockProject).isExcluded,
      ).toBe(true);
      expect(
        exclusionChecker.checkFileExclusion('src/utils/validator.spec.js', mockProject).isExcluded,
      ).toBe(true);
      expect(exclusionChecker.checkFileExclusion('src/main.ts', mockProject).isExcluded).toBe(
        false,
      );
    });

    it('should handle negation patterns', () => {
      mockProject.exclusionRules = ['*.log', '!important.log'];

      expect(exclusionChecker.checkFileExclusion('debug.log', mockProject).isExcluded).toBe(true);
      expect(exclusionChecker.checkFileExclusion('error.log', mockProject).isExcluded).toBe(true);
      expect(exclusionChecker.checkFileExclusion('important.log', mockProject).isExcluded).toBe(
        false,
      );
    });

    it('should handle root-only patterns', () => {
      mockProject.exclusionRules = ['/root-only.txt'];

      expect(exclusionChecker.checkFileExclusion('root-only.txt', mockProject).isExcluded).toBe(
        true,
      );
      expect(exclusionChecker.checkFileExclusion('src/root-only.txt', mockProject).isExcluded).toBe(
        false,
      );
    });

    it('should normalize file paths with leading slashes', () => {
      mockProject.exclusionRules = ['*.log'];

      expect(exclusionChecker.checkFileExclusion('/debug.log', mockProject).isExcluded).toBe(true);
      expect(exclusionChecker.checkFileExclusion('debug.log', mockProject).isExcluded).toBe(true);
    });

    it('should handle complex nested patterns', () => {
      mockProject.exclusionRules = [
        'node_modules/',
        'dist/',
        '*.log',
        '!important.log',
        'test/**/*.tmp',
        '**/*.backup',
      ];

      expect(
        exclusionChecker.checkFileExclusion('node_modules/package/index.js', mockProject)
          .isExcluded,
      ).toBe(true);
      expect(exclusionChecker.checkFileExclusion('dist/bundle.js', mockProject).isExcluded).toBe(
        true,
      );
      expect(exclusionChecker.checkFileExclusion('debug.log', mockProject).isExcluded).toBe(true);
      expect(exclusionChecker.checkFileExclusion('important.log', mockProject).isExcluded).toBe(
        false,
      );
      expect(
        exclusionChecker.checkFileExclusion('test/unit/cache.tmp', mockProject).isExcluded,
      ).toBe(true);
      expect(
        exclusionChecker.checkFileExclusion('src/main.ts.backup', mockProject).isExcluded,
      ).toBe(true);
      expect(exclusionChecker.checkFileExclusion('src/main.ts', mockProject).isExcluded).toBe(
        false,
      );
    });

    it('should handle empty file names', () => {
      mockProject.exclusionRules = ['*.log'];

      expect(exclusionChecker.checkFileExclusion('', mockProject).isExcluded).toBe(false);
    });

    it('should handle special characters in file names', () => {
      mockProject.exclusionRules = ['*special*.log'];

      expect(
        exclusionChecker.checkFileExclusion('my-special-file.log', mockProject).isExcluded,
      ).toBe(true);
      expect(
        exclusionChecker.checkFileExclusion('special!@#$%^&*().log', mockProject).isExcluded,
      ).toBe(true);
    });
  });

  describe('checkMultipleFileExclusions', () => {
    it('should return all files as not excluded when no exclusion rules are defined', () => {
      mockProject.exclusionRules = [];
      const filenames = ['src/main.ts', 'test/unit.test.ts', 'debug.log'];

      const result = exclusionChecker.checkMultipleFileExclusions(filenames, mockProject);

      expect(result.results.size).toBe(3);
      expect(result.results.get('src/main.ts')).toBe(false);
      expect(result.results.get('test/unit.test.ts')).toBe(false);
      expect(result.results.get('debug.log')).toBe(false);
      expect(result.project).toBe(mockProject);
    });

    it('should correctly exclude multiple files with different patterns', () => {
      mockProject.exclusionRules = ['*.log', '*.tmp', 'node_modules/', '**/*.test.ts'];
      const filenames = [
        'src/main.ts',
        'debug.log',
        'cache.tmp',
        'node_modules/package/index.js',
        'src/components/button.test.ts',
        'README.md',
      ];

      const result = exclusionChecker.checkMultipleFileExclusions(filenames, mockProject);

      expect(result.results.size).toBe(6);
      expect(result.results.get('src/main.ts')).toBe(false);
      expect(result.results.get('debug.log')).toBe(true);
      expect(result.results.get('cache.tmp')).toBe(true);
      expect(result.results.get('node_modules/package/index.js')).toBe(true);
      expect(result.results.get('src/components/button.test.ts')).toBe(true);
      expect(result.results.get('README.md')).toBe(false);
    });

    it('should handle negation patterns correctly for multiple files', () => {
      mockProject.exclusionRules = ['*.log', '!important.log', '!critical.log'];
      const filenames = ['debug.log', 'error.log', 'important.log', 'critical.log', 'main.ts'];

      const result = exclusionChecker.checkMultipleFileExclusions(filenames, mockProject);

      expect(result.results.get('debug.log')).toBe(true);
      expect(result.results.get('error.log')).toBe(true);
      expect(result.results.get('important.log')).toBe(false);
      expect(result.results.get('critical.log')).toBe(false);
      expect(result.results.get('main.ts')).toBe(false);
    });

    it('should handle empty file list', () => {
      mockProject.exclusionRules = ['*.log'];
      const filenames: string[] = [];

      const result = exclusionChecker.checkMultipleFileExclusions(filenames, mockProject);

      expect(result.results.size).toBe(0);
      expect(result.project).toBe(mockProject);
    });

    it('should handle complex patterns with many files', () => {
      mockProject.exclusionRules = [
        'node_modules/',
        'dist/',
        '*.log',
        '!important.log',
        'test/**/*.tmp',
        '**/*.backup',
        'src/**/*.spec.js',
        '!src/critical.spec.js',
      ];

      const filenames = [
        'node_modules/package/index.js',
        'dist/bundle.js',
        'debug.log',
        'important.log',
        'test/unit/cache.tmp',
        'src/main.ts.backup',
        'src/utils/helper.spec.js',
        'src/critical.spec.js',
        'src/main.ts',
        'README.md',
      ];

      const result = exclusionChecker.checkMultipleFileExclusions(filenames, mockProject);

      expect(result.results.get('node_modules/package/index.js')).toBe(true);
      expect(result.results.get('dist/bundle.js')).toBe(true);
      expect(result.results.get('debug.log')).toBe(true);
      expect(result.results.get('important.log')).toBe(false);
      expect(result.results.get('test/unit/cache.tmp')).toBe(true);
      expect(result.results.get('src/main.ts.backup')).toBe(true);
      expect(result.results.get('src/utils/helper.spec.js')).toBe(true);
      expect(result.results.get('src/critical.spec.js')).toBe(false);
      expect(result.results.get('src/main.ts')).toBe(false);
      expect(result.results.get('README.md')).toBe(false);
    });

    it('should be more efficient than individual calls for large batches', () => {
      mockProject.exclusionRules = ['*.log', 'node_modules/', '**/*.test.ts'];
      const filenames = Array.from({ length: 1000 }, (_, i) => `file${i}.ts`);

      const startTime = Date.now();
      const result = exclusionChecker.checkMultipleFileExclusions(filenames, mockProject);
      const batchTime = Date.now() - startTime;

      expect(result.results.size).toBe(1000);
      expect(batchTime).toBeLessThan(100); // Should complete quickly
    });

    it('should handle duplicate filenames', () => {
      mockProject.exclusionRules = ['*.log'];
      const filenames = ['debug.log', 'debug.log', 'main.ts', 'main.ts'];

      const result = exclusionChecker.checkMultipleFileExclusions(filenames, mockProject);

      expect(result.results.size).toBe(2); // Map deduplicates keys
      expect(result.results.get('debug.log')).toBe(true);
      expect(result.results.get('main.ts')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed exclusion rules gracefully', () => {
      mockProject.exclusionRules = ['[invalid-regex'];
      // The ignore library should handle this gracefully
      expect(() => exclusionChecker.checkFileExclusion('test.ts', mockProject)).not.toThrow();
    });

    it('should handle extremely long file paths', () => {
      mockProject.exclusionRules = ['**/*.log'];
      const longPath = `${'a/'.repeat(1000)}file.log`;

      expect(exclusionChecker.checkFileExclusion(longPath, mockProject).isExcluded).toBe(true);
    });

    it('should handle Unicode characters in file names and patterns', () => {
      mockProject.exclusionRules = ['*文件*.log', '**/*测试*.ts'];

      expect(exclusionChecker.checkFileExclusion('调试文件.log', mockProject).isExcluded).toBe(
        true,
      );
      expect(exclusionChecker.checkFileExclusion('src/单元测试.ts', mockProject).isExcluded).toBe(
        true,
      );
      expect(exclusionChecker.checkFileExclusion('src/main.ts', mockProject).isExcluded).toBe(
        false,
      );
    });
  });

  describe('gitignore compatibility', () => {
    it('should handle standard gitignore patterns', () => {
      mockProject.exclusionRules = [
        '# Comments should be ignored',
        '',
        '*.log',
        '!important.log',
        'node_modules/',
        'dist/',
        '*.tmp',
        '# Another comment',
        '**/*.backup',
      ];

      expect(exclusionChecker.checkFileExclusion('debug.log', mockProject).isExcluded).toBe(true);
      expect(exclusionChecker.checkFileExclusion('important.log', mockProject).isExcluded).toBe(
        false,
      );
      expect(
        exclusionChecker.checkFileExclusion('node_modules/package/index.js', mockProject)
          .isExcluded,
      ).toBe(true);
      expect(exclusionChecker.checkFileExclusion('dist/bundle.js', mockProject).isExcluded).toBe(
        true,
      );
      expect(exclusionChecker.checkFileExclusion('cache.tmp', mockProject).isExcluded).toBe(true);
      expect(
        exclusionChecker.checkFileExclusion('src/main.ts.backup', mockProject).isExcluded,
      ).toBe(true);
    });

    it('should handle directory-specific patterns', () => {
      mockProject.exclusionRules = ['src/*.log', 'test/**/*.tmp', 'docs/**/draft.*'];

      expect(exclusionChecker.checkFileExclusion('src/debug.log', mockProject).isExcluded).toBe(
        true,
      );
      expect(
        exclusionChecker.checkFileExclusion('src/nested/debug.log', mockProject).isExcluded,
      ).toBe(false);
      expect(
        exclusionChecker.checkFileExclusion('test/unit/cache.tmp', mockProject).isExcluded,
      ).toBe(true);
      expect(exclusionChecker.checkFileExclusion('test/cache.tmp', mockProject).isExcluded).toBe(
        true,
      );
      expect(exclusionChecker.checkFileExclusion('docs/api/draft.md', mockProject).isExcluded).toBe(
        true,
      );
      expect(
        exclusionChecker.checkFileExclusion('docs/user/section/draft.txt', mockProject).isExcluded,
      ).toBe(true);
    });

    it('should handle bracket expressions', () => {
      mockProject.exclusionRules = ['*.log[0-9]', 'test.[ch]', 'file[abc].txt'];

      expect(exclusionChecker.checkFileExclusion('debug.log1', mockProject).isExcluded).toBe(true);
      expect(exclusionChecker.checkFileExclusion('debug.log', mockProject).isExcluded).toBe(false);
      expect(exclusionChecker.checkFileExclusion('test.c', mockProject).isExcluded).toBe(true);
      expect(exclusionChecker.checkFileExclusion('test.h', mockProject).isExcluded).toBe(true);
      expect(exclusionChecker.checkFileExclusion('test.cpp', mockProject).isExcluded).toBe(false);
      expect(exclusionChecker.checkFileExclusion('filea.txt', mockProject).isExcluded).toBe(true);
      expect(exclusionChecker.checkFileExclusion('fileb.txt', mockProject).isExcluded).toBe(true);
      expect(exclusionChecker.checkFileExclusion('filed.txt', mockProject).isExcluded).toBe(false);
    });
  });
});
