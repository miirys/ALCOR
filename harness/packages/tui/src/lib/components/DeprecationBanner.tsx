import { execFile } from 'child_process';
import { promisify } from 'util';
import React, { useContext, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { EnvironmentContext } from '../environment_context';
import { Link } from './Link';

const INSTALL_DOCS_URL =
  'https://docs.gitlab.com/user/gitlab_duo_cli/?tab=Compiled+binary#set-up-the-gitlab-duo-cli';

const execFileP = promisify(execFile);

export type DeprecationStatus =
  | 'not-applicable'
  | 'use-glab-duo-cli'
  | 'update-glab'
  | 'glab-missing';

async function detect(): Promise<Exclude<DeprecationStatus, 'not-applicable'>> {
  try {
    await execFileP('glab', ['--version'], { timeout: 1000 });
  } catch {
    return 'glab-missing';
  }
  try {
    await execFileP('glab', ['duo', 'cli', '--help'], { timeout: 1000 });
    return 'use-glab-duo-cli';
  } catch {
    return 'update-glab';
  }
}

// Cache the in-flight or resolved promise so the check runs at most once per process,
// even if the hook remounts (e.g. during terminal resize).
let cachedPromise: Promise<DeprecationStatus> | undefined;

function getStatus(distribution: string): Promise<DeprecationStatus> {
  if (!cachedPromise) {
    // Off by default: the npm-release deprecation banner is boot-time noise that
    // interleaves with Ink's first paint. Opt back in with DUOX_SHOW_NPM_DEPRECATION=1.
    const enabled = process.env.DUOX_SHOW_NPM_DEPRECATION === '1';
    cachedPromise =
      enabled && distribution === 'npm' ? detect() : Promise.resolve('not-applicable');
  }
  return cachedPromise;
}

/** Returns `undefined` while the check is in flight; a `DeprecationStatus` once resolved. */
export function useDeprecationStatus(): DeprecationStatus | undefined {
  const { distribution } = useContext(EnvironmentContext);
  const [status, setStatus] = useState<DeprecationStatus | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getStatus(distribution)
      .then((result) => {
        if (!cancelled) setStatus(result);
        return undefined;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [distribution]);

  return status;
}

const LEAD = 'Duo CLI npm package (@gitlab/duo-cli) will stop receiving updates.';

export interface DeprecationBannerProps {
  status: Exclude<DeprecationStatus, 'not-applicable'>;
  /**
   * Terminal width. Required because this banner is rendered inside Ink's
   * `<Static>`, which does not constrain box width like the normal layout tree.
   * Without an explicit width the box grows to its content's max width and
   * overflows narrow terminals.
   */
  columns: number;
}

export const DeprecationBanner: React.FC<DeprecationBannerProps> = ({ status, columns }) => {
  return (
    <Box
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      marginBottom={1}
      flexDirection="column"
      width={columns}
    >
      <Text bold color="yellow">
        NPM release deprecation notice
      </Text>
      {status === 'use-glab-duo-cli' && (
        <Text>
          {LEAD} Use <Text color="cyan">glab duo cli</Text> instead.
        </Text>
      )}
      {status === 'update-glab' && (
        <Text>
          {LEAD} Update glab to use <Text color="cyan">glab duo cli</Text>.
        </Text>
      )}
      {status === 'glab-missing' && (
        <Box flexDirection="column">
          <Text>{LEAD} Choose a supported installation method:</Text>
          <Link url={INSTALL_DOCS_URL}>{INSTALL_DOCS_URL}</Link>
        </Box>
      )}
    </Box>
  );
};
