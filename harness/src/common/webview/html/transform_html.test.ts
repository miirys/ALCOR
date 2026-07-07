import { createFakePartial } from '@gitlab-org/test-utils';
import { UserService, GitLabUser } from '@gitlab-org/core';
import { NonceService } from '../nonce/nonce_service';
import { DefaultWebviewHtmlTransformer } from './transform_html';

describe('DefaultWebviewHtmlTransformer', () => {
  let nonceService: NonceService;
  let userService: UserService;
  let transformer: DefaultWebviewHtmlTransformer;

  const mockUserObject = (avatarUrl: string) => {
    const mockUser = createFakePartial<GitLabUser>({
      avatarUrl,
    });

    // Mock the user getter to return the mockUser
    Object.defineProperty(userService, 'user', {
      get: jest.fn().mockReturnValue(mockUser),
      configurable: true,
    });
  };

  beforeEach(() => {
    nonceService = createFakePartial<NonceService>({
      generateNonce: jest.fn().mockReturnValue('test-nonce-123'),
    });
    userService = createFakePartial<UserService>({
      user: undefined,
    });
    transformer = new DefaultWebviewHtmlTransformer(nonceService, userService);
  });

  describe('transformation pipeline', () => {
    it('should execute updateOrigin in the pipeline', () => {
      const html = '<div>{{origin}} {{nonce}}</div>';
      const result = transformer.transformHtml(html);

      // Both placeholders should be processed
      expect(result).not.toContain('{{origin}}');
      expect(result).not.toContain('{{nonce}}');
      expect(result).toContain('test-nonce-123');
    });
  });

  describe('updateOrigin transformation step', () => {
    it('should include updateOrigin in the transformation pipeline', () => {
      const html = "<div>img-src 'self' {{origin}} 'unsafe-inline'</div>";
      const result = transformer.transformHtml(html);

      // When no user is present, {{origin}} should be removed
      expect(result).toBe("<div>img-src 'self' 'unsafe-inline'</div>");
    });

    it('should extract origin from user avatarUrl when user is present', () => {
      mockUserObject('https://gitlab.example.com/uploads/avatar.jpg');

      const html = "<div>img-src 'self' {{origin}} 'unsafe-inline'</div>";
      const result = transformer.transformHtml(html);

      expect(result).toBe("<div>img-src 'self' https://gitlab.example.com 'unsafe-inline'</div>");
    });

    it('should handle user with data URI avatarUrl', () => {
      mockUserObject('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAggg==');

      const html = "<div>img-src 'self' {{origin}} 'unsafe-inline'</div>";

      expect(() => transformer.transformHtml(html)).not.toThrow();
      const result = transformer.transformHtml(html);

      expect(result).toBe("<div>img-src 'self' 'unsafe-inline'</div>");
    });
  });
});
