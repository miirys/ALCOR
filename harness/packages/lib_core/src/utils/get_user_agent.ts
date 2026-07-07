import { InitializeParams } from 'vscode-languageserver';
import { getLanguageServerVersion } from '../get_language_server_version';

type ClientInfo = InitializeParams['clientInfo'];

export const getUserAgent = (clientInfo?: ClientInfo) => {
  const clientInfoString = clientInfo
    ? `${clientInfo?.name}:${clientInfo?.version}`
    : 'missing client info';
  return `gitlab-language-server:${getLanguageServerVersion()} (${clientInfoString})`;
};
