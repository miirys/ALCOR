import React from 'react';
import { Text } from 'ink';
import { supportsHyperlinks, hyperlink } from '../hyperlinks';

export interface LinkProps {
  /** The URL to link to. */
  url: string;
  /** Display text. Defaults to the URL itself. */
  children?: string;
  /** Ink Text color. Defaults to "cyan". */
  color?: string;
}

/**
 * Ink component that renders an OSC 8 clickable hyperlink when the terminal
 * supports it, or falls back to showing the URL as plain text.
 */
export const Link: React.FC<LinkProps> = ({ url, children, color = 'cyan' }) => {
  const displayText = children ?? url;

  if (supportsHyperlinks()) {
    // Render the display text wrapped in OSC 8 escape sequences.
    // Ink preserves OSC sequences through its renderer.
    const linked = hyperlink(displayText, url);
    return <Text color={color}>{linked}</Text>;
  }

  // Fallback: show "text (url)" if text differs from url, or just the url
  const textStr = displayText;
  if (textStr !== url) {
    return (
      <Text>
        {textStr} (<Text color={color}>{url}</Text>)
      </Text>
    );
  }

  return <Text color={color}>{url}</Text>;
};
