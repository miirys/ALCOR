import { Disposable } from '@gitlab-org/disposable';
import { createFakePartial } from '@gitlab-org/test-utils';
import {
  CodeSuggestionsDirectAccessService,
  type CodeSuggestionsDirectAccessResult,
} from '../services/duo_access';
import { DefaultCodeSuggestionsCreditsCheck } from './code_suggestions_credits_check';

describe('DefaultCodeSuggestionsCreditsCheck', () => {
  const disposables: Disposable[] = [];

  let check: DefaultCodeSuggestionsCreditsCheck;
  let mockDirectAccessService: CodeSuggestionsDirectAccessService;
  let resultListeners: ((result: CodeSuggestionsDirectAccessResult) => void)[] = [];

  const checkEngagedChangeListener = jest.fn();

  beforeEach(() => {
    resultListeners = [];
    mockDirectAccessService = createFakePartial<CodeSuggestionsDirectAccessService>({
      onResult: jest.fn((listener) => {
        resultListeners.push(listener);
        return { dispose: () => {} };
      }),
    });

    check = new DefaultCodeSuggestionsCreditsCheck(mockDirectAccessService);
    disposables.push(check.onChanged(checkEngagedChangeListener));
  });

  afterEach(() => {
    resultListeners = [];

    while (disposables.length > 0) {
      disposables.pop()!.dispose();
    }
  });

  const emitResult = (result: CodeSuggestionsDirectAccessResult) => {
    resultListeners.forEach((listener) => listener(result));
  };

  describe('credits state management', () => {
    it('should NOT be engaged when service emits success', () => {
      emitResult({ status: 'success' });

      expect(check.engaged).toBe(false);
      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });

    it('should be engaged when service emits credits_exceeded', () => {
      emitResult({ status: 'credits_exceeded' });

      expect(check.engaged).toBe(true);
      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
      expect(checkEngagedChangeListener).toHaveBeenCalledWith({
        checkId: check.id,
        details: check.details,
        engaged: true,
      });
    });

    it('should NOT be engaged when service emits missing_default_namespace', () => {
      emitResult({ status: 'missing_default_namespace' });

      expect(check.engaged).toBe(false);
      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });

    it('should NOT be engaged when service emits error', () => {
      emitResult({ status: 'error', error: new Error('Network error') });

      expect(check.engaged).toBe(false);
      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });

    it('should emit when credits state changes from available to exceeded', () => {
      emitResult({ status: 'credits_exceeded' });

      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
      expect(check.engaged).toBe(true);
    });

    it('should emit when credits state changes from exceeded to available', () => {
      emitResult({ status: 'credits_exceeded' });

      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
      expect(check.engaged).toBe(true);

      jest.mocked(checkEngagedChangeListener).mockClear();

      emitResult({ status: 'success' });

      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
      expect(check.engaged).toBe(false);
    });

    it('should not emit when credits state is the same', () => {
      emitResult({ status: 'success' });

      expect(checkEngagedChangeListener).not.toHaveBeenCalled();

      emitResult({ status: 'success' });

      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });

    it('should not emit when missing namespace error occurs', () => {
      emitResult({ status: 'missing_default_namespace' });

      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
      expect(check.engaged).toBe(false);
    });

    it('should not emit when error occurs', () => {
      emitResult({ status: 'error', error: new Error('Network error') });

      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
      expect(check.engaged).toBe(false);
    });
  });

  describe('setCreditsExceeded', () => {
    it('should set credits exceeded to true and emit change', () => {
      check.setCreditsExceeded(true);

      expect(check.engaged).toBe(true);
      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
      expect(checkEngagedChangeListener).toHaveBeenCalledWith({
        checkId: check.id,
        details: check.details,
        engaged: true,
      });
    });

    it('should set credits exceeded to false and emit change', () => {
      check.setCreditsExceeded(true);
      jest.mocked(checkEngagedChangeListener).mockClear();

      check.setCreditsExceeded(false);

      expect(check.engaged).toBe(false);
      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
      expect(checkEngagedChangeListener).toHaveBeenCalledWith({
        checkId: check.id,
        details: check.details,
        engaged: false,
      });
    });

    it('should emit even when setting to the same value', () => {
      check.setCreditsExceeded(true);
      jest.mocked(checkEngagedChangeListener).mockClear();

      check.setCreditsExceeded(true);

      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
      expect(check.engaged).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should dispose all subscriptions', () => {
      const disposeSpy = jest.fn();
      jest.mocked(mockDirectAccessService.onResult).mockReturnValueOnce({
        dispose: disposeSpy,
      });

      const newCheck = new DefaultCodeSuggestionsCreditsCheck(mockDirectAccessService);
      newCheck.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should remove all listeners from state emitter', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      disposables.push(check.onChanged(listener1));
      disposables.push(check.onChanged(listener2));

      check.dispose();

      emitResult({ status: 'credits_exceeded' });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });
});
