import { router, CHAT_ROUTE, FLOW_ROUTE } from './index';

describe('Router Configuration', () => {
  describe('router configuration', () => {
    it('exports a router instance', () => {
      expect(router).toBeDefined();
      expect(router.options).toBeDefined();
    });

    it('has correct base path', () => {
      expect(router.options.base).toBe('/webview/agentic-tabs/');
    });

    it('uses hash mode', () => {
      expect(router.options.mode).toBe('hash');
    });

    it('has routes for both chat and workflow webviews', () => {
      const { routes } = router.options;

      expect(routes).toHaveLength(3); // root redirect + 2 webview routes

      // Check root redirect
      const rootRoute = routes.find((route) => route.path === '/');
      expect(rootRoute).toBeDefined();
      expect(rootRoute.redirect).toEqual({ name: CHAT_ROUTE });

      // Check chat route
      const chatRoute = routes.find((route) => route.name === CHAT_ROUTE);
      expect(chatRoute).toBeDefined();
      expect(chatRoute.path).toBe(`/${CHAT_ROUTE}`);

      // Check workflow route
      const workflowRoute = routes.find((route) => route.name === FLOW_ROUTE);
      expect(workflowRoute).toBeDefined();
      expect(workflowRoute.path).toBe(`/${FLOW_ROUTE}`);
    });
  });
});
