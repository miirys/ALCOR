import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import React, { useContext } from 'react';
import { UnifiedInputProvider, UnifiedInputContext } from '../input/unified';
import { KeyHandlerProvider } from './key_handler_context';
import { useKeyHandler } from './use_key_handler';

describe('useKeyHandler integration', () => {
  it('executes child handler before parent handler', () => {
    const callOrder: string[] = [];
    let triggerKeyPress: (key: string) => void = () => {
      throw new Error('triggerKeyPress not initialized');
    };

    const ChildComponent: React.FC = () => {
      useKeyHandler(() => {
        callOrder.push('child');
      });

      return <></>;
    };

    const ParentComponent: React.FC = () => {
      useKeyHandler(() => {
        callOrder.push('parent');
      });

      return <ChildComponent />;
    };

    const TestWrapper: React.FC = () => {
      const unifiedInput = useContext(UnifiedInputContext);

      triggerKeyPress = (key: string) => {
        unifiedInput.processRawInput(Buffer.from(key));
      };

      return <ParentComponent />;
    };

    render(
      <UnifiedInputProvider>
        <KeyHandlerProvider>
          <TestWrapper />
        </KeyHandlerProvider>
      </UnifiedInputProvider>,
    );

    triggerKeyPress('a');

    // Child handler should execute first due to React useEffect execution order
    expect(callOrder).toEqual(['child', 'parent']);
  });
});
