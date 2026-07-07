import WebSocket from 'isomorphic-ws';
import { createCable } from '@anycable/core';
import { connectToCable } from './action_cable';

const mockCable = {
  connect: jest.fn(),
};

jest.mock('@anycable/core', () => ({
  createCable: jest.fn().mockImplementation(() => mockCable),
}));

jest.mock('./log', () => ({
  log: {
    error: jest.fn(),
  },
}));

describe('connectToCable', () => {
  it('creates new anycable cable and connects', async () => {
    const connection = await connectToCable(new URL('https://foo.bar'));

    expect(createCable).toHaveBeenCalledWith('wss://foo.bar/-/cable', {
      websocketImplementation: WebSocket,
    });
    expect(mockCable.connect).toHaveBeenCalled();

    expect(connection).toStrictEqual(mockCable);
  });

  it('respects http protocol and port', async () => {
    await connectToCable(new URL('http://foo.bar:3000'));

    expect(createCable).toHaveBeenCalledWith('ws://foo.bar:3000/-/cable', expect.anything());
  });

  it('respects custom path to gitlab instance', async () => {
    await connectToCable(new URL('https://foo.bar/path/to/gitlab'));

    expect(createCable).toHaveBeenCalledWith(
      'wss://foo.bar/path/to/gitlab/-/cable',
      expect.anything(),
    );
  });

  it('adds additional websocket options if provided', async () => {
    const additionalOptions = { headers: 'foo' };

    await connectToCable(new URL('https://foo.bar'), additionalOptions);

    expect(createCable).toHaveBeenCalledWith('wss://foo.bar/-/cable', {
      websocketImplementation: WebSocket,
      websocketOptions: additionalOptions,
    });
  });

  it('throws error if connection to cable fails', async () => {
    const err = new Error('Foo Bar');
    mockCable.connect = jest.fn(() => {
      throw err;
    });

    await expect(connectToCable(new URL('https://foo.bar'))).rejects.toThrow(err);
  });
});
