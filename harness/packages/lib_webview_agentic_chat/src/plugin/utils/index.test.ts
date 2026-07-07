import {
  DuoWorkflowEventConnection,
  generateErrorMessageFromStatusCode,
  parseLangGraphCheckpoint,
} from '@gitlab-lsp/workflow-api';
import {
  defaultCheckpoint,
  langGraphPayload,
  LANG_EVENT_EXECUTING,
  parsedLangGraphPayload,
  DUO_EVENT_PLANNING,
  DUO_EVENT_COMPLETED,
  DUO_EVENT_EXECUTING,
} from '../mock_data';
import {
  getLatestEvent,
  getLatestCheckpoint,
  parseWorkflowData,
  parseWorkflowEventsResponse,
} from './index';

describe('index.ts', () => {
  describe('generateErrorMessageFromStatusCode', () => {
    it.each`
      statusCode | expectedMessage
      ${1}       | ${'Your request was valid but Workflow failed to complete it. Please try again.'}
      ${2}       | ${'failed to start'}
      ${3}       | ${'use your token to connect to your GitLab instance.'}
      ${4}       | ${'service could not create the workflow'}
      ${5}       | ${'failed to start'}
      ${6}       | ${'could not connect to the Workflow service.'}
      ${50}      | ${'An error occurred while fetching an authentication token for this workflow.'}
      ${51}      | ${'GitLab API configuration details (instanceUrl and token) are unavailable in the extension. Restart your editor and try again.'}
      ${53}      | ${'If you are using a proxy or custom certificate authority you must configure this.'}
      ${54}      | ${'The connection to the server was dropped or abnormally closed.'}
      ${55}      | ${'The connection to the server was closed because the message was too large.'}
      ${56}      | ${'The connection to the server was closed because the server encountered an internal error.'}
      ${57}      | ${'The connection to the server was closed because the server encountered an error from an upstream service (502 bad gateway).'}
      ${58}      | ${'The connection to the server was closed due to a failure to perform a TLS handshake (server certificate cannot be verified).'}
      ${59}      | ${'The connection to the server was closed because the message contained an unsupported data type.'}
      ${60}      | ${'GitLab Duo is already responding to this chat in another tab or location. Start a new chat, or wait for GitLab Duo to finish before sending a new message.'}
      ${null}    | ${'Your request was valid but Workflow failed to complete it. Please try again.'}
    `('converts code $statusCode to expected message', ({ statusCode, expectedMessage }) => {
      expect(generateErrorMessageFromStatusCode(statusCode)).toContain(expectedMessage);
    });
  });

  describe('parseLangGraphCheckpoint', () => {
    it('should parse a valid JSON string', () => {
      const checkpoint = JSON.stringify({ key: 'value' });
      expect(parseLangGraphCheckpoint(checkpoint)).toEqual({ key: 'value' });
    });

    it('should throw an error for invalid JSON', () => {
      const invalidCheckpoint = 'invalid json';
      expect(() => parseLangGraphCheckpoint(invalidCheckpoint)).toThrow(
        'Failed to parse checkpoint',
      );
    });
  });

  describe('getLatestCheckpoint', () => {
    it('does not modify array in place', () => {
      const sortedCheckpoints = getLatestCheckpoint(parsedLangGraphPayload);
      expect(sortedCheckpoints).not.toBe(parsedLangGraphPayload);
    });

    it.each`
      checkpoints                                                       | expected               | desc
      ${[DUO_EVENT_PLANNING, DUO_EVENT_EXECUTING, DUO_EVENT_COMPLETED]} | ${DUO_EVENT_COMPLETED} | ${'when they are already in the correct order'}
      ${[DUO_EVENT_EXECUTING, DUO_EVENT_COMPLETED, DUO_EVENT_PLANNING]} | ${DUO_EVENT_COMPLETED} | ${'when they are not in the correct order'}
      ${[DUO_EVENT_PLANNING]}                                           | ${DUO_EVENT_PLANNING}  | ${'when there is only one checkpoint'}
      ${[]}                                                             | ${defaultCheckpoint}   | ${'when there are no checkpoints'}
    `(
      'sort checkpoints by timestamps from oldest to newest when $desc',
      ({ checkpoints, expected }) => {
        const latestCheckpoint = getLatestCheckpoint(checkpoints);
        expect(latestCheckpoint).toEqual(expected);
      },
    );
  });

  describe('getLatestEvent', () => {
    describe('when there are no events', () => {
      it('should return null', () => {
        const response: DuoWorkflowEventConnection = {
          duoWorkflowEvents: {
            nodes: [],
          },
          duoWorkflowWorkflows: {
            nodes: [],
          },
        };
        expect(getLatestEvent(response)).toBeNull();
      });
    });

    describe('when there are events', () => {
      it('should return the latest event from the response', () => {
        const response: DuoWorkflowEventConnection = langGraphPayload;
        expect(getLatestEvent(response)).toEqual(LANG_EVENT_EXECUTING);
      });
    });
  });

  describe('parseWorkflowEventsResponse', () => {
    it('should parse the workflow events response', () => {
      const response: DuoWorkflowEventConnection = langGraphPayload;

      const parsedResponse = parseWorkflowEventsResponse(response);
      expect(parsedResponse).toEqual(langGraphPayload.duoWorkflowEvents.nodes);
    });
  });

  describe('parseWorkflowData', () => {
    it('should parse workflow data correctly', () => {
      const parsedData = parseWorkflowData(langGraphPayload);
      expect(parsedData).toEqual(DUO_EVENT_COMPLETED);
    });
  });
});
