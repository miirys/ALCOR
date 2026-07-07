import type { HtmlTransformStep } from '../types';
import { buildCSP } from '../utils/csp_builder';

export const addContentSecurityPolicy: HtmlTransformStep = (html: string) => {
  const cspContent = buildCSP();
  const cspMetaTag = `<meta http-equiv="Content-Security-Policy" content="${cspContent}" />`;

  // Check if CSP already exists
  const cspRegex = /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]+"\s*\/?>/i;

  if (cspRegex.test(html)) {
    return html.replace(cspRegex, cspMetaTag);
  }

  // Add new CSP in head
  const headEndIndex = html.indexOf('</head>');
  if (headEndIndex !== -1) {
    return `${html.slice(0, headEndIndex)}  ${cspMetaTag}\n${html.slice(headEndIndex)}`;
  }

  return html;
};
