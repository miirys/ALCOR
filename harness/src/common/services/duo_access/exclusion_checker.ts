import { createInterfaceId, Injectable } from '@gitlab/needle';
import ignore from 'ignore';
import { FeatureFlagService, InstanceFeatureFlags } from '@gitlab-org/core';
import { DuoProject } from './workspace_project_access_cache';

/**
 * Result of checking if a file is excluded by project exclusion rules.
 */
export interface ExclusionCheckResult {
  /**
   * Whether the file is excluded by the project's exclusion rules.
   */
  isExcluded: boolean;
  /**
   * The specific project that determined the exclusion status.
   */
  project: DuoProject;
}

/**
 * Result of checking multiple files against exclusion rules.
 */
export interface BatchExclusionCheckResult {
  /**
   * Map of file paths to their exclusion status.
   */
  results: Map<string, boolean>;
  /**
   * The specific project that determined the exclusion status.
   */
  project: DuoProject;
}

/**
 * Service for checking if files are excluded based on project exclusion rules.
 * The exclusion rules are in gitignore format and support standard gitignore patterns.
 */
export interface DuoExclusionChecker {
  /**
   * Check if a single file is excluded by the project's exclusion rules.
   *
   * @param filename The filename to check (can be relative or absolute path)
   * @param project The project with exclusion rules to check against
   * @returns Result indicating whether the file is excluded
   */
  checkFileExclusion(filename: string, project: DuoProject): ExclusionCheckResult;

  /**
   * Check multiple files against the project's exclusion rules.
   * This is more efficient than calling checkFileExclusion multiple times
   * as it only needs to compile the exclusion rules once.
   *
   * @param filenames Array of filenames to check
   * @param project The project with exclusion rules to check against
   * @returns Result with exclusion status for each file
   */
  checkMultipleFileExclusions(filenames: string[], project: DuoProject): BatchExclusionCheckResult;
}

export const DuoExclusionChecker = createInterfaceId<DuoExclusionChecker>('DuoExclusionChecker');

@Injectable(DuoExclusionChecker, [FeatureFlagService])
export class DefaultDuoExclusionChecker implements DuoExclusionChecker {
  #featureFlagService: FeatureFlagService;

  constructor(featureFlagService: FeatureFlagService) {
    this.#featureFlagService = featureFlagService;
  }

  /**
   * Check if a single file is excluded by the project's exclusion rules.
   */
  checkFileExclusion(filename: string, project: DuoProject): ExclusionCheckResult {
    // If the feature flag is disabled, never exclude any files
    if (
      !this.#featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.UseDuoContextExclusion)
    ) {
      return {
        isExcluded: false,
        project,
      };
    }

    const isExcluded = this.#isFileExcluded(filename, project.exclusionRules);
    return {
      isExcluded,
      project,
    };
  }

  /**
   * Check multiple files against the project's exclusion rules.
   */
  checkMultipleFileExclusions(filenames: string[], project: DuoProject): BatchExclusionCheckResult {
    const results = new Map<string, boolean>();

    // If the feature flag is disabled, never exclude any files
    if (
      !this.#featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.UseDuoContextExclusion)
    ) {
      filenames.forEach((filename) => results.set(filename, false));
      return { results, project };
    }

    // If no exclusion rules are defined, no files are excluded
    if (!project.exclusionRules || project.exclusionRules.length === 0) {
      filenames.forEach((filename) => results.set(filename, false));
      return { results, project };
    }

    // Compile the exclusion rules once for efficiency
    const ignoreInstance = ignore().add(project.exclusionRules);

    filenames.forEach((filename) => {
      const isExcluded = ignoreInstance.ignores(this.#normalizeFilePath(filename));
      results.set(filename, isExcluded);
    });

    return { results, project };
  }

  /**
   * Check if a file is excluded by the given exclusion rules.
   */
  #isFileExcluded(filename: string, exclusionRules: string[]): boolean {
    // If no exclusion rules are defined, the file is not excluded
    if (!exclusionRules || exclusionRules.length === 0) {
      return false;
    }

    // Normalize and validate the filename
    const normalizedFilename = this.#normalizeFilePath(filename);
    if (!normalizedFilename) {
      return false; // Empty filenames are not excluded
    }

    // Create an ignore instance with the exclusion rules
    const ignoreInstance = ignore().add(exclusionRules);

    // Check if the file is ignored by the rules
    return ignoreInstance.ignores(normalizedFilename);
  }

  /**
   * Normalize file path for consistent matching.
   * Removes leading slash and ensures consistent path separators.
   */
  #normalizeFilePath(filename: string): string {
    return filename.startsWith('/') ? filename.slice(1) : filename;
  }
}
