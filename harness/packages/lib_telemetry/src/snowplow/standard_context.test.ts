import Ajv from 'ajv-draft-04';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import { GitLabUser } from '@gitlab-org/core';
import { SAAS_INSTANCE_URL } from '../constants';
import StandardContextSchema from './schemas/standard_context_schema-1-1-1.json';
import * as SnowplowMetaSchema from './schemas/snowplow_schema-1-0-0.json';
import {
  DefaultStandardContext,
  StandardContext,
  STANDARD_CONTEXT_SCHEMA,
  environmentFromHost,
  ENVIRONMENT_URLS,
  ENVIRONMENT_NAMES,
} from './standard_context';

describe('DefaultStandardContext', () => {
  let configService: ConfigService;
  let standardContext: StandardContext;
  let userService: { user?: GitLabUser; getUser: jest.Mock };

  beforeEach(() => {
    configService = new DefaultConfigService();

    configService.set('telemetry.extension', { name: 'Test Extension' });
    configService.set('baseUrl', SAAS_INSTANCE_URL);

    userService = {
      user: undefined,
      getUser: jest.fn(),
    };

    standardContext = new DefaultStandardContext(configService, userService);
  });

  describe('initialization', () => {
    it('should initialize the context with the given config data', () => {
      const result = standardContext.build();

      expect(result.data.source).toBe('Test Extension');
      expect(result.data.host_name).toBe('https://gitlab.com');
      expect(result.data.environment).toBe('production');
    });

    it('should update context on config change', () => {
      const newConfig = {
        telemetry: {
          extension: { name: 'New Extension' },
        },
        baseUrl: 'https://staging.gitlab.com',
      };
      configService.merge(newConfig);
      const result = standardContext.build();

      expect(result.data.source).toBe('New Extension');
      expect(result.data.host_name).toBe('https://staging.gitlab.com');
      expect(result.data.environment).toBe('staging');
    });
  });

  describe('environmentFromHost', () => {
    it.each`
      url                                    | expectedEnvironment
      ${ENVIRONMENT_URLS.GITLAB_COM}         | ${ENVIRONMENT_NAMES.GITLAB_COM}
      ${ENVIRONMENT_URLS.GITLAB_STAGING}     | ${ENVIRONMENT_NAMES.GITLAB_STAGING}
      ${ENVIRONMENT_URLS.GITLAB_ORG}         | ${ENVIRONMENT_NAMES.GITLAB_ORG}
      ${ENVIRONMENT_URLS.GITLAB_DEVELOPMENT} | ${ENVIRONMENT_NAMES.GITLAB_DEVELOPMENT}
      ${'http://localhost:3000'}             | ${ENVIRONMENT_NAMES.GITLAB_DEVELOPMENT}
      ${'https://custom.gitlab.com'}         | ${ENVIRONMENT_NAMES.GITLAB_SELF_MANAGED}
    `('when URL is "$url" should return "$expectedEnvironment"', ({ url, expectedEnvironment }) => {
      const environment = environmentFromHost(url);
      expect(environment).toBe(expectedEnvironment);
    });
  });

  describe('build', () => {
    it('should build a valid SelfDescribingJson with default values', () => {
      const result = standardContext.build();

      expect(result).toEqual({
        schema: STANDARD_CONTEXT_SCHEMA,
        data: {
          source: 'Test Extension',
          extra: undefined,
          environment: 'production',
          host_name: 'https://gitlab.com',
          user_id: null,
        },
      });
    });

    it('should include extra fields if provided', () => {
      const extra = { foo: 'bar', baz: 'qux' };
      const result = standardContext.build(extra);

      expect(result.data.extra).toEqual(extra);
    });

    it('should set user_id to null when no user is authenticated', () => {
      userService.user = undefined;

      const result = standardContext.build();

      expect(result.data.user_id).toBeNull();
    });

    it('should include the authenticated user REST id as user_id', () => {
      userService.user = {
        restId: 123,
        id: 'gid://gitlab/User/123',
        username: 'test-user',
        name: 'Test User',
        avatarUrl: '',
      } satisfies GitLabUser;

      const result = standardContext.build();

      expect(result.data.user_id).toBe(123);
    });
  });

  describe('validation gate (events must not be dropped)', () => {
    const validateStandardContext = (data: unknown): boolean => {
      const ajv = new Ajv({ strict: false });
      ajv.addMetaSchema(SnowplowMetaSchema);
      return ajv.validate(StandardContextSchema, data) as boolean;
    };

    it('passes validation when unauthenticated (user_id is null)', () => {
      userService.user = undefined;

      const result = standardContext.build();

      expect(result.data.user_id).toBeNull();
      expect(validateStandardContext(result.data)).toBe(true);
    });

    it('passes validation when authenticated (user_id is the REST id)', () => {
      userService.user = {
        restId: 123,
        id: 'gid://gitlab/User/123',
        username: 'test-user',
        name: 'Test User',
        avatarUrl: '',
      } satisfies GitLabUser;

      const result = standardContext.build();

      expect(result.data.user_id).toBe(123);
      expect(validateStandardContext(result.data)).toBe(true);
    });
  });
});
