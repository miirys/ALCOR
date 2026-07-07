import { execSync } from 'child_process';
import { platform } from 'os';
import { createInterfaceId, Injectable } from '@gitlab/needle';

export interface ClipboardService {
  copy(text: string): void;
}

export const ClipboardService = createInterfaceId<ClipboardService>('ClipboardService');

@Injectable(ClipboardService, [])
export class DefaultClipboardService implements ClipboardService {
  copy(text: string): void {
    const p = platform();
    const options = { input: text, timeout: 5000 };

    if (p === 'darwin') {
      execSync('pbcopy', options);
    } else if (p === 'win32') {
      execSync('clip', options);
    } else {
      const tools = ['xclip -selection clipboard', 'xsel --clipboard --input', 'wl-copy'];
      const errors: string[] = [];
      for (const cmd of tools) {
        try {
          execSync(cmd, options);
          return;
        } catch (e) {
          errors.push(`${cmd}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      throw new Error(`Clipboard copy failed.\n${errors.join('\n')}`);
    }
  }
}
