import React, { useEffect, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import stringWidth from 'string-width';
import { TextBuffer } from '../text_buffer';
import { maskedPlaceholder } from '../string';
import { useUnifiedInput, KeyChecks } from '../input/unified';
import { computeScrollWindow } from '../scroll_window';

interface MultilineTextInputProps {
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  masked?: boolean;
  ignoreKeys?: string[];
  initialTextBuffer?: TextBuffer;
  onHistoryPrevious?: (currentText: string) => void;
  onHistoryNext?: (currentText: string) => void;
  maxVisibleLines?: number;
  title?: string;
  borderColor?: string;
  promptPrefix?: string;
}

export const MultilineTextInput: React.FC<MultilineTextInputProps> = ({
  value,
  onChange,
  placeholder = '',
  masked,
  ignoreKeys = [],
  initialTextBuffer = new TextBuffer(value),
  onHistoryPrevious,
  onHistoryNext,
  maxVisibleLines,
  title,
  borderColor = 'cyan',
  promptPrefix = '❯ ',
}) => {
  const [{ textBuffer }, updateTextBuffer] = useState({ textBuffer: initialTextBuffer });
  const { stdout } = useStdout();

  useEffect(() => {
    textBuffer.onBufferChange = () => {
      updateTextBuffer({ textBuffer });
    };
  }, [textBuffer]);

  useUnifiedInput((key) => {
    if (KeyChecks.isEnter(key)) {
      return;
    }

    if (ignoreKeys.includes(key.name)) {
      return;
    }

    if (key.name === 'paste' && key.sequence) {
      const pastedText = key.sequence;
      textBuffer.insert(pastedText, true);
    }

    if (key.name === 'home' || (key.name === 'a' && key.ctrl)) {
      textBuffer.home();
    } else if (key.name === 'end' || (key.name === 'e' && key.ctrl)) {
      textBuffer.end();
    } else if (
      KeyChecks.isShiftEnter(key) ||
      key.name === 'linefeed' ||
      (key.name === 'j' && key.ctrl)
    ) {
      textBuffer.insert('\n');
    } else if (key.name === 'left' && (key.ctrl || key.meta)) {
      textBuffer.wordLeft();
    } else if (key.name === 'right' && (key.ctrl || key.meta)) {
      textBuffer.wordRight();
    } else if (key.name === 'b' && key.meta) {
      textBuffer.wordLeft();
    } else if (key.name === 'f' && key.meta) {
      textBuffer.wordRight();
    } else if (key.name === 'left') {
      textBuffer.left();
    } else if (key.name === 'right') {
      textBuffer.right();
    } else if (key.name === 'backspace' && (key.ctrl || key.meta)) {
      textBuffer.deleteWordToCursor();
    } else if (key.name === 'backspace') {
      textBuffer.delete();
    } else if (key.name === 'delete' && (key.ctrl || key.meta)) {
      textBuffer.deleteWordFromCursor();
    } else if (key.name === 'delete') {
      textBuffer.deleteAfterCursor();
    } else if (key.name === 'd' && key.ctrl) {
      textBuffer.deleteAfterCursor();
    } else if (key.name === 'u' && key.ctrl) {
      textBuffer.deleteLineToCursor();
    } else if (key.name === 'space') {
      textBuffer.insert(' ');
    } else if (key.name === 'up') {
      const isAtFirstLine = textBuffer.cursor.line === 0;
      if (isAtFirstLine) {
        onHistoryPrevious?.(textBuffer.text);
      } else {
        textBuffer.up();
      }
    } else if (key.name === 'down') {
      const isAtLastLine = textBuffer.cursor.line === textBuffer.lines.length - 1;
      if (isAtLastLine) {
        onHistoryNext?.(textBuffer.text);
      } else {
        textBuffer.down();
      }
    } else if (!key.ctrl && !key.meta && key.name.length === 1) {
      // Prefer key.sequence over key.name: for Kitty protocol, sequence contains the
      // actual character produced (e.g. '!' for Shift+1), while key.name holds the base
      // key ('1'). For standard terminals, sequence equals the character sent directly.
      // Fall back to uppercasing key.name for Shift+letter when sequence is not set.
      let char = key.name;
      if (key.sequence && key.sequence.length === 1) {
        char = key.sequence;
      } else if (key.shift && key.name >= 'a' && key.name <= 'z') {
        char = key.name.toUpperCase();
      }
      textBuffer.insert(char);
    }

    if (textBuffer.text !== value) {
      onChange(textBuffer.text);
    }
  });

  // lines are derived from the value prop and hence should not be kept in the component's state
  // but rather be computed from the buffer state on render
  textBuffer.setText(value);
  const { lines, cursor } = textBuffer;

  const termRows = stdout?.rows ?? 24;
  const termCols = stdout?.columns ?? 80;
  const maxRowBudget = maxVisibleLines ?? Math.max(3, Math.floor(termRows * 0.4));

  const { visibleItems, windowStart, showScrollUp, showScrollDown } = computeScrollWindow(
    lines,
    cursor.line,
    maxRowBudget,
    (line) => Math.max(1, Math.ceil(((stringWidth(line) || 1) + promptPrefix.length) / termCols)),
  );

  const renderInputWithCursor = () => {
    if (lines.length === 1 && lines[0] === '') {
      return (
        <>
          <Text>█ </Text>
          <Text dimColor>{placeholder}</Text>
        </>
      );
    }

    return (
      <Text>
        {visibleItems.map((line, visibleIdx) => {
          const globalIdx = visibleIdx + windowStart;
          return (
            <React.Fragment key={globalIdx}>
              {globalIdx === cursor.line ? (
                <>
                  <Text>{maskedPlaceholder(line.slice(0, cursor.column), masked)}</Text>
                  <Text inverse>
                    {line[cursor.column] ? maskedPlaceholder(line[cursor.column], masked) : ' '}
                  </Text>
                  <Text>{maskedPlaceholder(line.slice(cursor.column + 1), masked)}</Text>
                </>
              ) : (
                <Text>{maskedPlaceholder(line, masked)}</Text>
              )}
              {visibleIdx < visibleItems.length - 1 && '\n'}
            </React.Fragment>
          );
        })}
      </Text>
    );
  };

  const titleLabel = title ? ` ${title} ` : '';
  const rightMargin = title ? 2 : 0;
  const topBorderDashes = '─'.repeat(Math.max(0, termCols - stringWidth(titleLabel) - rightMargin));

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={borderColor}>{topBorderDashes}</Text>
        {title && (
          <Text color={borderColor} inverse>
            {titleLabel}
          </Text>
        )}
        {title && <Text color={borderColor}>{'─'.repeat(rightMargin)}</Text>}
      </Box>
      <Box
        borderLeft={false}
        borderRight={false}
        borderTop={false}
        borderStyle="single"
        borderColor={borderColor}
        flexDirection="column"
      >
        {showScrollUp && <Text dimColor>{'▲'}</Text>}
        <Box>
          <Text>{promptPrefix}</Text>
          {renderInputWithCursor()}
        </Box>
        {showScrollDown && <Text dimColor>{'▼'}</Text>}
      </Box>
    </Box>
  );
};
