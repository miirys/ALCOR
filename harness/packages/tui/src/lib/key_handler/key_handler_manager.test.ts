import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UnifiedInputSystem } from '../input/unified/unified_input_system';
import { KeyHandlerManager } from './key_handler_manager';
import type { KeyEvent } from './types';

describe('KeyHandlerManager', () => {
  let unifiedInput: UnifiedInputSystem;
  let keyHandlerManager: KeyHandlerManager;

  beforeEach(() => {
    unifiedInput = new UnifiedInputSystem();
    keyHandlerManager = new KeyHandlerManager(unifiedInput);
  });

  describe('when no handlers are registered', () => {
    it('does not throw errors when keys are pressed', () => {
      expect(() => {
        unifiedInput.processRawInput(Buffer.from('a'));
      }).not.toThrow();
    });
  });

  describe('when a single handler is registered', () => {
    it('routes key events to the handler', () => {
      const handler = jest.fn();

      keyHandlerManager.addHandler(handler);
      unifiedInput.processRawInput(Buffer.from('a'));

      expect(handler).toHaveBeenCalledTimes(1);
      const event = (handler as jest.Mock).mock.calls[0][0] as KeyEvent;
      expect(event.name).toBe('a');
      expect(event.sequence).toBe('a');
    });

    it('preserves all ParsedKey properties', () => {
      const handler = jest.fn();

      keyHandlerManager.addHandler(handler);

      // Simulate Ctrl+A via raw input
      unifiedInput.processRawInput(Buffer.from('\x01'));

      expect(handler).toHaveBeenCalledTimes(1);
      const event = (handler as jest.Mock).mock.calls[0][0] as KeyEvent;
      expect(event.name).toBe('a');
      expect(event.ctrl).toBe(true);
    });
  });

  describe('when multiple handlers are registered', () => {
    it('calls handlers in registration order (first-registered-first)', () => {
      const callOrder: string[] = [];

      const handler1 = jest.fn(() => callOrder.push('handler1'));
      const handler2 = jest.fn(() => callOrder.push('handler2'));
      const handler3 = jest.fn(() => callOrder.push('handler3'));

      keyHandlerManager.addHandler(handler1);
      keyHandlerManager.addHandler(handler2);
      keyHandlerManager.addHandler(handler3);

      unifiedInput.processRawInput(Buffer.from('a'));

      expect(callOrder).toEqual(['handler1', 'handler2', 'handler3']);
    });

    it('calls all handlers if none stop propagation', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      keyHandlerManager.addHandler(handler1);
      keyHandlerManager.addHandler(handler2);
      keyHandlerManager.addHandler(handler3);

      unifiedInput.processRawInput(Buffer.from('a'));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });
  });

  describe('when using stopPropagation', () => {
    it('stops calling subsequent handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn((event: KeyEvent) => {
        event.stopPropagation();
      });
      const handler3 = jest.fn();

      keyHandlerManager.addHandler(handler1);
      keyHandlerManager.addHandler(handler2);
      keyHandlerManager.addHandler(handler3);

      unifiedInput.processRawInput(Buffer.from('a'));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).not.toHaveBeenCalled();
    });

    it('stops immediately when first registered handler stops propagation', () => {
      const handler1 = jest.fn((event: KeyEvent) => {
        event.stopPropagation();
      });
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      keyHandlerManager.addHandler(handler1);
      keyHandlerManager.addHandler(handler2);
      keyHandlerManager.addHandler(handler3);

      unifiedInput.processRawInput(Buffer.from('a'));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).not.toHaveBeenCalled();
    });
  });

  describe('when removing handlers', () => {
    it('removes handler when unsubscribe is called', () => {
      const handler = jest.fn();

      const unsubscribe = keyHandlerManager.addHandler(handler);
      unsubscribe();

      unifiedInput.processRawInput(Buffer.from('a'));

      expect(handler).not.toHaveBeenCalled();
    });

    it('only removes the specified handler', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      keyHandlerManager.addHandler(handler1);
      const unsubscribe2 = keyHandlerManager.addHandler(handler2);
      keyHandlerManager.addHandler(handler3);

      unsubscribe2();

      unifiedInput.processRawInput(Buffer.from('a'));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('maintains order after removing a handler', () => {
      const callOrder: string[] = [];

      const handler1 = jest.fn(() => callOrder.push('handler1'));
      const handler2 = jest.fn(() => callOrder.push('handler2'));
      const handler3 = jest.fn(() => callOrder.push('handler3'));

      keyHandlerManager.addHandler(handler1);
      const unsubscribe2 = keyHandlerManager.addHandler(handler2);
      keyHandlerManager.addHandler(handler3);

      unsubscribe2();

      unifiedInput.processRawInput(Buffer.from('a'));

      expect(callOrder).toEqual(['handler1', 'handler3']);
    });

    it('handles calling unsubscribe multiple times gracefully', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      keyHandlerManager.addHandler(handler1);
      const unsubscribe2 = keyHandlerManager.addHandler(handler2);

      expect(() => {
        unsubscribe2();
        unsubscribe2();
      }).not.toThrow();

      unifiedInput.processRawInput(Buffer.from('a'));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('when disposing', () => {
    it('cleans up resources', () => {
      const handler = jest.fn();

      keyHandlerManager.addHandler(handler);
      keyHandlerManager.dispose();

      unifiedInput.processRawInput(Buffer.from('a'));

      // Should not receive events after disposal
      expect(handler).not.toHaveBeenCalled();
    });

    it('clears all handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      keyHandlerManager.addHandler(handler1);
      keyHandlerManager.addHandler(handler2);

      keyHandlerManager.dispose();

      unifiedInput.processRawInput(Buffer.from('a'));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });
});
