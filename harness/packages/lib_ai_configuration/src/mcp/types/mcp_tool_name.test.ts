// packages/lib_ai_configuration/src/mcp/types/mcp_tool_name.test.ts

import { McpToolName, McpToolAddress, MCP_TOOL_DELIMITER } from './mcp_tool_name';
import type { ServerName } from './mcp';

describe('McpToolName', () => {
  const addr = (server: string, tool: string): McpToolAddress => ({
    serverName: server as ServerName,
    toolName: tool,
  });

  describe('create', () => {
    test.each([
      ['simple', 'server', 'tool', 'mcp__server__tool'],
      ['underscores', 'library_docs', 'get_docs', 'mcp__library_docs__get_docs'],
      ['numbers', 'server1', 'tool2', 'mcp__server1__tool2'],
      ['single chars', 'a', 'b', 'mcp__a__b'],
      [
        'long names',
        'my_long_server',
        'my_long_tool_name',
        'mcp__my_long_server__my_long_tool_name',
      ],
    ])('%s', (_desc, server, tool, expected) => {
      expect(McpToolName.create(addr(server, tool))).toBe(expected);
    });
  });

  describe('parse', () => {
    test.each([
      ['simple', 'mcp__server__tool', 'server', 'tool'],
      ['underscores', 'mcp__library_docs__get_docs', 'library_docs', 'get_docs'],
      ['numbers', 'mcp__server1__tool2', 'server1', 'tool2'],
      ['long', 'mcp__my_long_server__my_long_tool', 'my_long_server', 'my_long_tool'],
      ['multiple triple', 'mcp__server__a___b___c', 'server', 'a___b___c'],
      ['quad underscore', 'mcp__server__tool____name', 'server', 'tool____name'],
    ])('%s', (_desc, input, server, tool) => {
      expect(McpToolName.parse(input as McpToolName)).toEqual(addr(server, tool));
    });

    test.each([
      ['no prefix', 'server__tool'],
      ['wrong prefix', 'tcp__server__tool'],
      ['single underscore', 'mcp_server_tool'],
      ['one part', 'mcp__server'],
      ['empty server', 'mcp____tool'],
      ['empty tool', 'mcp__server__'],
      ['just prefix', 'mcp__'],
    ])('throws for %s: %s', (_desc, input) => {
      expect(() => McpToolName.parse(input as McpToolName)).toThrow(/Invalid MCP tool name/);
    });

    describe('with invalid ServerName', () => {
      test.each([
        ['spaces in server', 'mcp__my server__tool'],
        ['empty server', 'mcp____tool'],
        ['special chars', 'mcp__server@123__tool'],
        ['too long', `mcp__${'a'.repeat(251)}__tool`],
      ])('%s', (_desc, input) => {
        expect(() => McpToolName.parse(input as McpToolName)).toThrow(/Invalid/);
      });
    });
  });

  describe('is', () => {
    test.each([
      ['mcp__server__tool', true],
      ['mcp__library_docs__get_docs', true],
      ['mcp__a__b', true],
      ['server__tool', false],
      ['mcp__server', false],
      ['mcp__', false],
      ['mcp____tool', false],
      ['mcp__server__', false],
      ['mcp__server__tool___name', true],
      ['mcp__server__a___b___c', true],
      ['mcp__server__tool____name', true],
      ['', false],
    ])('is("%s") = %s', (input, expected) => {
      expect(McpToolName.is(input)).toBe(expected);
    });

    describe('with invalid ServerName', () => {
      test.each([
        ['mcp__my server__tool', false],
        ['mcp____tool', false],
        ['mcp__server@123__tool', false],
        [`mcp__${'a'.repeat(251)}__tool`, false],
      ])('is("%s") = %s', (input, expected) => {
        expect(McpToolName.is(input)).toBe(expected);
      });
    });
  });

  describe('roundtrip', () => {
    test.each([
      ['server', 'tool'],
      ['library_docs', 'get-docs'],
      ['my_server', 'my_tool'],
      ['very_long_server_name', 'some_tool_name'],
      ['my-server', 'fetch-data'],
      ['server.v1', 'tool.v2'],
      ['my-server_v1.0', 'fetch-user-data_v2'],
      ['srv', 'a___b___c___d'],
    ])('server=%s tool=%s', (server, tool) => {
      const original = addr(server, tool);
      const canonical = McpToolName.create(original);
      const parsed = McpToolName.parse(canonical);

      expect(parsed).toEqual(original);
      expect(McpToolName.is(canonical)).toBe(true);
    });
  });

  describe('constants', () => {
    it('uses __ as delimiter', () => {
      expect(MCP_TOOL_DELIMITER).toBe('__');
    });

    it('created names use constants', () => {
      const name = McpToolName.create(addr('srv', 'tl'));
      expect(name.split(MCP_TOOL_DELIMITER)).toHaveLength(3);
    });
  });
});
