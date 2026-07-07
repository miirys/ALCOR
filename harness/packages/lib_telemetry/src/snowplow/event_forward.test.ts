import {
  supportsEventForwarding,
  supportsStandardContext,
  getEventForwarderEndpoint,
} from './event_forwarding';

describe('Version comparison and event forwarding', () => {
  describe('supportsEventForwarding', () => {
    it('should return true for gitlab.com regardless of version', () => {
      expect(supportsEventForwarding(new URL('https://gitlab.com'), '18.0.0')).toBe(true);
      expect(supportsEventForwarding(new URL('https://gitlab.com'), '19.0.0')).toBe(true);
      expect(supportsEventForwarding(new URL('https://gitlab.com'), '17.0.0')).toBe(true);
    });

    it('should return false for self-managed instances with version < 18.0', () => {
      expect(supportsEventForwarding(new URL('https://gitlab.example.com'), '17.9.9')).toBe(false);
      expect(supportsEventForwarding(new URL('https://gitlab.example.com'), '17.0.0')).toBe(false);
      expect(supportsEventForwarding(new URL('https://gitlab.example.com'), '16.0.0')).toBe(false);
    });

    it('should return true for self-managed instances with version >= 18.0', () => {
      expect(supportsEventForwarding(new URL('https://gitlab.example.com'), '18.0.0')).toBe(true);
      expect(supportsEventForwarding(new URL('https://gitlab.example.com'), '18.1.0')).toBe(true);
      expect(supportsEventForwarding(new URL('https://gitlab.example.com'), '19.0.0')).toBe(true);
    });

    it('should work with different instance URLs', () => {
      expect(supportsEventForwarding(new URL('https://my-gitlab.company.com'), '18.0.0')).toBe(
        true,
      );
      expect(supportsEventForwarding(new URL('https://gitlab.internal'), '18.5.0')).toBe(true);
      expect(supportsEventForwarding(new URL('http://localhost:3000'), '18.0.0')).toBe(true);
    });
  });

  describe('supportsStandardContext', () => {
    it('should return true for instances >= 19.0.0', () => {
      expect(supportsStandardContext('19.0.0')).toBe(true);
      expect(supportsStandardContext('19.1.0')).toBe(true);
      expect(supportsStandardContext('19.2.0')).toBe(true);
    });

    it('should return false for instances < 19.0.0', () => {
      expect(supportsStandardContext('18.11.0')).toBe(false);
      expect(supportsStandardContext('18.10.0')).toBe(false);
      expect(supportsStandardContext('17.0.0')).toBe(false);
    });
  });

  describe('getEventForwarderEndpoint', () => {
    it('should return the correct event forwarder endpoint', () => {
      expect(getEventForwarderEndpoint(new URL('https://gitlab.example.com'))).toBe(
        'https://gitlab.example.com/-/collect_events',
      );
      expect(getEventForwarderEndpoint(new URL('https://my-gitlab.company.com:8080'))).toBe(
        'https://my-gitlab.company.com:8080/-/collect_events',
      );
      expect(getEventForwarderEndpoint(new URL('http://localhost:3000'))).toBe(
        'http://localhost:3000/-/collect_events',
      );
    });
  });
});
