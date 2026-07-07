import { spawn } from 'node:child_process';
import { closeSync, openSync, writeSync } from 'node:fs';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { Disposable } from '@gitlab-org/disposable';
import type { NotificationTarget } from './notification_target';

export interface DesktopNotification {
  title: string;
  body: string;
}

const BEL = '\x07';

/**
 * Delivers a system notification using the mechanism chosen by `resolveNotificationTarget`.
 *
 * - `osc9` / `osc777`: write a terminal-native notification escape to /dev/tty. The terminal
 *   emulator raises the notification, plays its sound, and clicking it focuses that terminal
 *   (also works over SSH). These sequences don't move the cursor, so they're render-safe.
 * - `bell`: write the terminal bell (BEL) to /dev/tty. The terminal handles it (audible and
 *   click-safe); used where no terminal-native notification exists, e.g. Apple Terminal.
 * - `notify-send` / `powershell`: shell out to platform tooling (fire-and-forget; a missing
 *   binary or any spawn error is swallowed at debug level).
 *
 * No runtime npm dependency.
 */
export class DesktopNotifier implements Disposable {
  #logger: Logger;

  #platform: NodeJS.Platform;

  #ttyHandle: number | undefined;

  #ttyUnavailable = false;

  /** Writes a raw sequence to the terminal. Overridable in tests; defaults to /dev/tty. */
  #writeToTerminal: (seq: string) => void;

  constructor(
    logger: Logger,
    platform: NodeJS.Platform = process.platform,
    writeToTerminal?: (seq: string) => void,
  ) {
    this.#logger = withPrefix(logger, '[DesktopNotifier]');
    this.#platform = platform;
    this.#writeToTerminal = writeToTerminal ?? ((seq) => this.#writeToTty(seq));
  }

  notify(target: NotificationTarget, { title, body }: DesktopNotification): void {
    const safeTitle = sanitize(title);
    const safeBody = sanitize(body);

    switch (target.kind) {
      case 'osc9':
        // iTerm2 / VS Code: OSC 9 carries a single message string.
        this.#writeToTerminal(`\x1b]9;${safeTitle}: ${safeBody}${BEL}`);
        return;
      case 'osc777':
        // Ghostty / urxvt: OSC 777 ; notify ; <title> ; <body>
        this.#writeToTerminal(`\x1b]777;notify;${safeTitle};${safeBody}${BEL}`);
        return;
      case 'bell':
        // Terminal-owned bell: audible and click-safe (used where no terminal-native
        // notification exists, e.g. Apple Terminal). Carries no text.
        this.#writeToTerminal(BEL);
        return;
      case 'none':
        return;
      default:
        this.#spawnNotifier(target.kind, safeTitle, safeBody);
    }
  }

  dispose(): void {
    if (this.#ttyHandle !== undefined) {
      try {
        closeSync(this.#ttyHandle);
      } catch {
        // fd may already be invalid
      }
      this.#ttyHandle = undefined;
    }
  }

  #spawnNotifier(kind: NotificationTarget['kind'], title: string, body: string): void {
    const command = this.#buildCommand(kind, title, body);
    if (!command) {
      this.#logger.debug(`No desktop notification command for ${kind} on ${this.#platform}`);
      return;
    }

    try {
      const child = spawn(command.cmd, command.args, {
        stdio: 'ignore',
        detached: true,
        windowsHide: true,
      });
      // Don't keep the event loop alive waiting on the notifier.
      child.unref();
      // Swallow errors (e.g. ENOENT when the binary is absent).
      child.on('error', (error) => {
        this.#logger.debug(`Desktop notification failed: ${(error as Error).message}`);
      });
    } catch (error) {
      this.#logger.debug(`Failed to spawn desktop notifier: ${(error as Error).message}`);
    }
  }

  #buildCommand(
    kind: NotificationTarget['kind'],
    title: string,
    body: string,
  ): { cmd: string; args: string[] } | undefined {
    switch (kind) {
      case 'notify-send':
        // notify-send receives title/body as separate argv entries (no shell).
        return { cmd: 'notify-send', args: ['--app-name=GitLab Duo', title, body] };
      case 'powershell': {
        // Best-effort toast via PowerShell. Degrades silently if unavailable.
        const script = buildWindowsToastScript(title, body);
        return {
          cmd: 'powershell',
          args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
        };
      }
      default:
        return undefined;
    }
  }

  #writeToTty(seq: string): void {
    if (this.#ttyUnavailable) return;
    try {
      if (this.#ttyHandle === undefined) {
        this.#ttyHandle = openSync('/dev/tty', 'w');
      }
      writeSync(this.#ttyHandle, seq);
    } catch (error) {
      this.#ttyUnavailable = true;
      this.#logger.debug(
        `Failed to write to /dev/tty, disabling terminal notifications: ${(error as Error).message}`,
      );
    }
  }
}

/** Strip control characters (incl. ESC and BEL) so they can't break or inject into a sequence. */
function sanitize(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f\x80-\x9f]/g, ' ').trim();
}

/** Escape characters for embedding in a single-quoted PowerShell string. */
function escapePowerShell(value: string): string {
  return value.replace(/'/g, "''");
}

function buildWindowsToastScript(title: string, body: string): string {
  const safeTitle = escapePowerShell(title);
  const safeBody = escapePowerShell(body);
  return [
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null;',
    '$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02);',
    '$texts = $template.GetElementsByTagName("text");',
    `$texts.Item(0).AppendChild($template.CreateTextNode('${safeTitle}')) > $null;`,
    `$texts.Item(1).AppendChild($template.CreateTextNode('${safeBody}')) > $null;`,
    '$toast = [Windows.UI.Notifications.ToastNotification]::new($template);',
    '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("GitLab Duo").Show($toast);',
  ].join(' ');
}
