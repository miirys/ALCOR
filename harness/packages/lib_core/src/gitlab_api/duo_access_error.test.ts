import {
  DUO_NAMESPACE_NOT_ENTITLED_MESSAGE,
  DUO_NO_NAMESPACE_DETECTED_MESSAGE,
  DUO_USAGE_QUOTA_EXCEEDED_MESSAGE,
  classifyDuoAccessError,
  isDuoAccessMessage,
} from './duo_access_error';

describe('classifyDuoAccessError', () => {
  it('classifies a missing_default_duo_group body as no_namespace', () => {
    expect(
      classifyDuoAccessError(403, JSON.stringify({ error: 'missing_default_duo_group' })),
    ).toEqual({ kind: 'no_namespace', message: DUO_NO_NAMESPACE_DETECTED_MESSAGE });
  });

  it('classifies a USAGE_QUOTA_EXCEEDED 403 as quota_exceeded', () => {
    expect(
      classifyDuoAccessError(
        403,
        JSON.stringify({ message: '403 Forbidden - USAGE_QUOTA_EXCEEDED: Usage quota exceeded' }),
      ),
    ).toEqual({ kind: 'quota_exceeded', message: DUO_USAGE_QUOTA_EXCEEDED_MESSAGE });
  });

  it('classifies a 403 as not_entitled', () => {
    expect(classifyDuoAccessError(403, JSON.stringify({ message: 'forbidden' }))).toEqual({
      kind: 'not_entitled',
      message: DUO_NAMESPACE_NOT_ENTITLED_MESSAGE,
    });
  });

  it('returns undefined for a 404 (handled per-endpoint by the caller)', () => {
    expect(classifyDuoAccessError(404, undefined)).toBeUndefined();
    expect(
      classifyDuoAccessError(404, JSON.stringify({ error: 'missing_default_duo_group' })),
    ).toBeUndefined();
  });

  it('returns undefined for other statuses', () => {
    expect(classifyDuoAccessError(500, undefined)).toBeUndefined();
    expect(classifyDuoAccessError(401, undefined)).toBeUndefined();
    expect(classifyDuoAccessError(undefined, undefined)).toBeUndefined();
  });

  it('returns undefined for a non-Duo 200-ish response with no body', () => {
    expect(classifyDuoAccessError(200, '')).toBeUndefined();
  });

  it('tolerates a non-JSON body', () => {
    expect(classifyDuoAccessError(403, 'not json')).toEqual({
      kind: 'not_entitled',
      message: DUO_NAMESPACE_NOT_ENTITLED_MESSAGE,
    });
    expect(classifyDuoAccessError(500, 'not json')).toBeUndefined();
  });
});

describe('isDuoAccessMessage', () => {
  it('recognises the Duo access messages', () => {
    expect(isDuoAccessMessage(DUO_NAMESPACE_NOT_ENTITLED_MESSAGE)).toBe(true);
    expect(isDuoAccessMessage(DUO_NO_NAMESPACE_DETECTED_MESSAGE)).toBe(true);
    expect(isDuoAccessMessage(DUO_USAGE_QUOTA_EXCEEDED_MESSAGE)).toBe(true);
  });

  it('rejects other, decorated, or empty messages', () => {
    expect(isDuoAccessMessage(`Failed: ${DUO_NAMESPACE_NOT_ENTITLED_MESSAGE}`)).toBe(false);
    expect(isDuoAccessMessage('some other error')).toBe(false);
    expect(isDuoAccessMessage(undefined)).toBe(false);
    expect(isDuoAccessMessage('')).toBe(false);
  });
});
