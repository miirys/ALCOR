/**
 * Globally mock MCP config resolution paths to prevent spawning real MCP servers during tests.
 *
 * When we have actual MCP servers configured locally (e.g., ~/.gitlab/duo/mcp.json),
 * the integration tests would spawn real MCP server processes. When tests complete,
 * these processes crash with EPIPE errors because their stdio streams are closed abruptly.
 * This can cause jest errors and timeouts and creates noise when reading test results.
 *
 * This setup manipulates environment variables to make `getDuoConfigDir()` return a
 * non-existent directory, so MCP config files won't be found and no servers will spawn.
 *
 * We use a unique temporary path that doesn't exist to ensure no MCP configs are loaded.
 */
(() => {
  const MOCK_DUO_CONFIG_DIR = `/tmp/.jest-mcp-mock-nonexistent-path-${process.pid}`;

  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  const originalAppData = process.env.APPDATA;

  beforeAll(() => {
    process.env.APPDATA = MOCK_DUO_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = MOCK_DUO_CONFIG_DIR;
  });

  afterAll(() => {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    process.env.APPDATA = originalAppData;
  });
})();
