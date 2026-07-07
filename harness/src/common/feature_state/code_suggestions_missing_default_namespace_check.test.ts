import { Disposable } from '@gitlab-org/disposable';
import { createFakePartial } from '@gitlab-org/test-utils';
import {
  CodeSuggestionsDirectAccessService,
  type CodeSuggestionsDirectAccessResult,
} from '../services/duo_access';
import { DefaultCodeSuggestionsMissingDefaultNamespaceCheck } from './code_suggestions_missing_default_namespace_check';

describe('DefaultCodeSuggestionsMissingDefaultNamespaceCheck', () => {
  const disposables: Disposable[] = [];

  let check: DefaultCodeSuggestionsMissingDefaultNamespaceCheck;
  let mockDirectAccessService: CodeSuggestionsDirectAccessService;
  let resultListeners: ((result: CodeSuggestionsDirectAccessResult) => void)[] = [];
  let checkEngagedChangeListener: jest.Mock;

  beforeEach(() => {
    checkEngagedChangeListener = jest.fn();
    resultListeners = [];

    mockDirectAccessService = createFakePartial<CodeSuggestionsDirectAccessService>({
      onResult: jest.fn((listener) => {
        resultListeners.push(listener);
        return { dispose: () => {} };
      }),
    });

    check = new DefaultCodeSuggestionsMissingDefaultNamespaceCheck(mockDirectAccessService);
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

  describe('missing namespace state', () => {
    it('should not be engaged initially', () => {
      expect(check.engaged).toBe(false);
    });

    it('should be engaged when service emits missing_default_namespace', () => {
      emitResult({ status: 'missing_default_namespace' });

      expect(check.engaged).toBe(true);
      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
      expect(checkEngagedChangeListener).toHaveBeenCalledWith({
        checkId: check.id,
        details: check.details,
        engaged: true,
      });
    });

    it('should not be engaged when service emits success', () => {
      emitResult({ status: 'success' });

      expect(check.engaged).toBe(false);
      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });

    it('should not be engaged when service emits credits_exceeded', () => {
      emitResult({ status: 'credits_exceeded' });

      expect(check.engaged).toBe(false);
      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });

    it('should not be engaged when service emits error', () => {
      emitResult({ status: 'error', error: new Error('Network error') });

      expect(check.engaged).toBe(false);
      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });

    it('should not emit when setting to the same value', () => {
      emitResult({ status: 'missing_default_namespace' });

      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);

      jest.mocked(checkEngagedChangeListener).mockClear();

      emitResult({ status: 'missing_default_namespace' });

      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });

    it('should emit when state changes from missing to available', () => {
      emitResult({ status: 'missing_default_namespace' });

      expect(check.engaged).toBe(true);
      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);

      jest.mocked(checkEngagedChangeListener).mockClear();

      emitResult({ status: 'success' });

      expect(check.engaged).toBe(false);
      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
      expect(checkEngagedChangeListener).toHaveBeenCalledWith({
        checkId: check.id,
        details: check.details,
        engaged: false,
      });
    });

    it('should have correct id', () => {
      expect(check.id).toBe('code-suggestions-no-default-namespace');
    });

    it('should have correct details message', () => {
      expect(check.details).toContain('default GitLab Duo namespace');
      expect(check.details).toContain('preferences');
    });
  });

  describe('dispose', () => {
    it('should dispose all subscriptions', () => {
      const mockCheckWithDisposable = createFakePartial<CodeSuggestionsDirectAccessService>({
        onResult: jest.fn(() => {
          return { dispose: jest.fn() };
        }),
      });

      const newCheck = new DefaultCodeSuggestionsMissingDefaultNamespaceCheck(
        mockCheckWithDisposable,
      );
      newCheck.dispose();

      expect(newCheck.engaged).toBe(false);
    });

    it('should remove all listeners from state emitter', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      disposables.push(check.onChanged(listener1));
      disposables.push(check.onChanged(listener2));

      check.dispose();

      check.setMissingDefaultNamespace(true);

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });
});
