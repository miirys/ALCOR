import { z } from 'zod';
import { NO_PARAMS, NO_RESPONSE } from '../constants';
import { declareRequest } from './declare_request';

describe('RequestDeclarationBuilder', () => {
  describe('Constructor', () => {
    it('should initialize a request with method name and default schemas', () => {
      const builder = declareRequest('test/request');
      const request = builder.build();

      expect(request.methodName).toBe('test/request');
      expect(request.type).toBe('request');
      expect(request.paramsSchema).toBe(NO_PARAMS);
      expect(request.responseSchema).toBe(NO_RESPONSE);
    });
  });

  describe('withName', () => {
    it('should add a name to the request definition', () => {
      const request = declareRequest('test/request').withName('Test Request').build();

      expect(request.name).toBe('Test Request');
    });
  });

  describe('withDescription', () => {
    it('should add a description to the request definition', () => {
      const request = declareRequest('test/request')
        .withDescription('This is a test request')
        .build();

      expect(request.description).toBe('This is a test request');
    });
  });

  describe('withParams', () => {
    it('should update the params schema and type', () => {
      const paramsSchema = z.object({
        key: z.string(),
        value: z.number(),
      });

      const request = declareRequest('test/request').withParams(paramsSchema).build();

      expect(request.paramsSchema).toBe(paramsSchema);
    });

    it('should allow chaining of multiple method calls', () => {
      const paramsSchema = z.object({
        userId: z.string(),
        timestamp: z.number(),
      });

      const responseSchema = z.object({
        success: z.boolean(),
      });

      const request = declareRequest('test/request')
        .withName('User Request')
        .withDescription('A request to fetch user data')
        .withParams(paramsSchema)
        .withResponse(responseSchema)
        .build();

      expect(request.name).toBe('User Request');
      expect(request.description).toBe('A request to fetch user data');
      expect(request.paramsSchema).toBe(paramsSchema);
      expect(request.responseSchema).toBe(responseSchema);
    });
  });

  describe('withResponse', () => {
    it('should update the response schema and type', () => {
      const responseSchema = z.object({
        success: z.boolean(),
        data: z.string().optional(),
      });

      const request = declareRequest('test/request').withResponse(responseSchema).build();

      expect(request.responseSchema).toBe(responseSchema);
    });
  });

  describe('build', () => {
    it('should return a valid RpcRequestDefinition', () => {
      const paramsSchema = z.object({
        id: z.number(),
      });

      const responseSchema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const request = declareRequest('test/request')
        .withName('Get User')
        .withDescription('Fetch user details by ID')
        .withParams(paramsSchema)
        .withResponse(responseSchema)
        .build();

      expect(request).toEqual({
        type: 'request',
        methodName: 'test/request',
        name: 'Get User',
        description: 'Fetch user details by ID',
        paramsSchema,
        responseSchema,
      });
    });

    it('should return a definition with default NO_PARAMS and NO_RESPONSE schemas', () => {
      const request = declareRequest('test/defaults').build();

      expect(request.paramsSchema.safeParse(undefined).success).toBe(true);
      expect(request.responseSchema.safeParse(undefined).success).toBe(true);
    });
  });
});
