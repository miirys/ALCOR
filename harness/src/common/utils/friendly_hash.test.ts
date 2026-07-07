import { friendlyTokenHashOnlyForLogging } from './friendly_hash';

describe('friendlyTokenHashOnlyForLogging', () => {
  it.each`
    input         | output
    ${'user123'}  | ${'kind-cow'}
    ${'password'} | ${'honest-narwhal'}
    ${'test'}     | ${'brilliant-seal'}
    ${'johndoe'}  | ${'bright-seahorse'}
  `(`hashes $input as $output`, ({ input, output }: { input: string; output: string }) => {
    expect(friendlyTokenHashOnlyForLogging(input)).toBe(output);
  });

  it('removes all content before the last dash', () => {
    expect(friendlyTokenHashOnlyForLogging('pat-token')).toBe(
      friendlyTokenHashOnlyForLogging('token'),
    );
  });
});
