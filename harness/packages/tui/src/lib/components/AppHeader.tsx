import { ReactElement, useContext } from 'react';
import { Box, Spacer, Text } from 'ink';
import { EnvironmentContext } from '../environment_context';
import { AlcorLogo } from './GitLabLogo';
import { Markdown } from './Markdown';

export interface AppHeaderProps {
  cwd?: string;
  children: ReactElement;
  /**
   * Terminal width. Required because the header is rendered inside Ink's
   * `<Static>`, which does not constrain box width like the normal layout tree.
   * Used to wrap the info column and to hide the logo on narrow terminals.
   */
  columns: number;
}

// Below this width the GitLab logo is dropped so the info column has room to
// wrap instead of overflowing the terminal.
const MIN_WIDTH_FOR_LOGO = 60;

export const AppHeader: React.FC<AppHeaderProps> = ({ children, columns }) => {
  const envInfo = useContext(EnvironmentContext);
  const markdownVersionText = `**ALCOR** v${envInfo.duoCliVersion}`;
  const showLogo = columns >= MIN_WIDTH_FOR_LOGO;

  return (
    <Box width={columns}>
      {showLogo && (
        <>
          <Box flexDirection="column" justifyContent="center" flexShrink={0}>
            <AlcorLogo />
            <Spacer />
            <Markdown markdown={markdownVersionText} />
          </Box>
          <Box
            borderRight
            borderLeft={false}
            borderTop={false}
            borderBottom={false}
            borderStyle="round"
            borderColor="#44444c"
            flexShrink={0}
          >
            <Text> </Text>
          </Box>
          <Box flexShrink={0}>
            <Text> </Text>
          </Box>
        </>
      )}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        {children}
      </Box>
    </Box>
  );
};
