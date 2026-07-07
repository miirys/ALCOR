import { createViteConfigForWebview } from '@gitlab-org/vite-common-config';
import { THEMING_PREVIEW_WEBVIEW_ID } from './metadata';

// eslint-disable-next-line import/no-default-export
export default createViteConfigForWebview(THEMING_PREVIEW_WEBVIEW_ID);
