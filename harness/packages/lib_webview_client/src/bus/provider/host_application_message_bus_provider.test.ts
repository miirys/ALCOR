import { MessageBus } from '@gitlab-org/message-bus';
import { HostApplicationMessageBusProvider } from './host_application_message_bus_provider';

const TEST_MESSAGE_BUS: MessageBus = {} as MessageBus;

describe('HostApplicationMessageBusProvider', () => {
  let subject: HostApplicationMessageBusProvider;

  const setHostConfig = (config: unknown) => {
    Object.assign(window, {
      gitlab: config,
    });
  };

  beforeAll(() => {
    globalThis.window = {} as Window & typeof globalThis;
  });

  beforeEach(() => {
    subject = new HostApplicationMessageBusProvider();
  });

  afterEach(() => {
    if ('gitlab' in window) {
      delete window.gitlab;
    }
  });

  describe('getMessageBus', () => {
    it.each`
      desc                        | hostConfig                    | expected
      ${'with no host config'}    | ${undefined}                  | ${null}
      ${'with null host config'}  | ${null}                       | ${null}
      ${'with empty host config'} | ${{}}                         | ${null}
      ${'with valid host config'} | ${{ host: TEST_MESSAGE_BUS }} | ${TEST_MESSAGE_BUS}
    `('$desc, returns $expected', ({ hostConfig, expected }) => {
      if (hostConfig !== undefined) {
        setHostConfig(hostConfig);
      }

      const actual = subject.getMessageBus();

      expect(actual).toBe(expected);
    });
  });
});
