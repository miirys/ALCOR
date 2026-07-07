export interface SystemInfo {
  cliVersion: string;
  distribution: string;
  osPlatform: string;
  osVersion: string;
  terminalName: string;
  shell?: string;
}

export interface DescriptionOptions {
  description: string;
  type: 'bug' | 'feature';
  systemInfo: SystemInfo;
  logContent?: string;
  includeLogPlaceholder?: boolean;
  labels?: string[];
}

/**
 * Builds formatted issue descriptions for GitLab issues.
 * Used by both API and URL submission handlers to ensure consistent formatting.
 */
export class IssueDescriptionBuilder {
  /**
   * Builds a formatted issue description with sections separated by horizontal rules.
   */
  static build(options: DescriptionOptions): string {
    const sections: string[] = [];

    // Description section (with Summary heading for feature requests only)
    if (options.type === 'feature') {
      sections.push(this.#buildSummarySection(options.description));
    } else {
      // Bug reports: no heading, just description
      sections.push(options.description);
    }

    // System Information section (bug reports only)
    if (options.type === 'bug') {
      sections.push(this.#buildSystemInfoSection(options.systemInfo));
    }

    // Logs section (bug reports only)
    if (options.type === 'bug') {
      const logSection = this.#buildLogSection(options.logContent, options.includeLogPlaceholder);
      if (logSection) {
        sections.push(logSection);
      }
    }

    // Quick action labels (URL submissions only)
    if (options.labels && options.labels.length > 0) {
      sections.push(this.#buildQuickActionLabels(options.labels));
    }

    return sections.join('\n\n---\n\n');
  }

  static #buildSummarySection(description: string): string {
    return `**Summary**\n\n${description}`;
  }

  static #buildSystemInfoSection(systemInfo: SystemInfo): string {
    const lines = [
      `- CLI Version: ${systemInfo.cliVersion}`,
      `- Distribution: ${systemInfo.distribution}`,
      `- OS: ${systemInfo.osPlatform} ${systemInfo.osVersion}`,
      `- Terminal: ${systemInfo.terminalName}`,
    ];

    // Only include shell if available
    if (systemInfo.shell) {
      lines.push(`- Shell: ${systemInfo.shell}`);
    }

    return `**System Information**\n\n${lines.join('\n')}`;
  }

  static #buildLogSection(logContent?: string, includeLogPlaceholder?: boolean): string | null {
    if (logContent) {
      // Actual logs included
      return (
        `**Recent CLI Logs (last 200 lines)**\n\n` +
        `<details>\n<summary>Click to expand logs</summary>\n\n` +
        `\`\`\`\n${logContent}\n\`\`\`\n\n</details>`
      );
    }

    if (includeLogPlaceholder) {
      // Placeholder for manual log addition
      return (
        `**Relevant logs and/or screenshots** (optional)\n\n` +
        `<!-- Run \`duo log list\` to show recent CLI log files -->`
      );
    }

    return null;
  }

  static #buildQuickActionLabels(labels: string[]): string {
    return `/label ${labels.map((label) => `~"${label}"`).join(' ')}`;
  }
}
