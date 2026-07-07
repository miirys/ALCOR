import { CompositeDisposable } from './composite_disposable';
import { Disposable } from './types';

describe('CompositeDisposable', () => {
  let compositeDisposable: CompositeDisposable;
  let disposable1: Disposable;
  let disposable2: Disposable;

  beforeEach(() => {
    compositeDisposable = new CompositeDisposable();
    disposable1 = { dispose: jest.fn() };
    disposable2 = { dispose: jest.fn() };
  });

  describe('size', () => {
    it('should return the correct number of disposables', () => {
      // Arrange
      compositeDisposable.add(disposable1);
      compositeDisposable.add(disposable2);

      // Act
      const { size } = compositeDisposable;

      // Assert
      expect(size).toBe(2);
    });
  });

  describe('add', () => {
    it('should add a disposable to the set', () => {
      // Act
      compositeDisposable.add(disposable1);

      // Assert
      expect(compositeDisposable.size).toBe(1);
    });

    it('should not add the same disposable twice', () => {
      // Act
      compositeDisposable.add(disposable1);
      compositeDisposable.add(disposable1);

      // Assert
      expect(compositeDisposable.size).toBe(1);
    });
  });

  describe('dispose', () => {
    it('should call dispose on all disposables', () => {
      // Arrange
      compositeDisposable.add(disposable1);
      compositeDisposable.add(disposable2);

      // Act
      compositeDisposable.dispose();

      // Assert
      expect(disposable1.dispose).toHaveBeenCalledTimes(1);
      expect(disposable2.dispose).toHaveBeenCalledTimes(1);
    });

    it('should clear the disposables set after disposing', () => {
      // Arrange
      compositeDisposable.add(disposable1);
      compositeDisposable.add(disposable2);

      // Act
      compositeDisposable.dispose();

      // Assert
      expect(compositeDisposable.size).toBe(0);
    });

    it('should handle being called multiple times', () => {
      // Arrange
      compositeDisposable.add(disposable1);

      // Act
      compositeDisposable.dispose();
      compositeDisposable.dispose();

      // Assert
      expect(disposable1.dispose).toHaveBeenCalledTimes(1);
      expect(compositeDisposable.size).toBe(0);
    });
  });
});
