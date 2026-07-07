import { createMetadataKey, setMetadata, getMetadata } from './store';

describe('metadata store', () => {
  it('should create unique metadata keys', () => {
    const key1 = createMetadataKey<string>('test');
    const key2 = createMetadataKey<string>('test');

    expect(key1.symbol).not.toBe(key2.symbol);
  });

  it('should get and set metadata correctly', () => {
    const target = {};
    const key = createMetadataKey<string>('test');

    setMetadata(target, key, 'value');
    expect(getMetadata(target, key)).toBe('value');
  });

  it('should return undefined for non-existent metadata', () => {
    const target = {};
    const key = createMetadataKey<string>('test');

    expect(getMetadata(target, key)).toBeUndefined();
  });
});
